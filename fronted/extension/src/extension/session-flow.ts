import type { ApiConfig } from "../api/config";
import { ApiError, isAuthenticationFailure } from "../api/errors";
import { notificationDestination, resolveScreen, type ScreenId } from "../shared/flow";
import { webviewMessageSchema } from "../shared/protocol";
import type { AuthService } from "./auth-service";
import { messageFromFrame, notificationFromFrame, presenceFromFrame, reactionFromFrame, typingFromFrame, type ServerFrame, type SocketStatus } from "./chat-socket";
import { applyUserReaction } from "./reaction-state";
import { mergePresence } from "./presence-state";
import { absorbServerNotifications, acceptLiveToast, applyNotificationRead, applyTombstone, dropClearedNotifications, mergeHistory, mergeLiveMessage, mergeNotification, mergeReceipt, unreadMessageNotificationsForConversation, visibleAfterClear } from "./realtime-state";
import { isRiskyFile } from "./crypto/file-payload";
import { encodeMediaPayload } from "./crypto/media-payload";
import { emptyHostState, type HostState } from "./webview";
import { MemoryChatCache, type ChatCache } from "./chat-cache";
import { createClientMessageId, isPermanentDeliveryError, MemoryOutbox, nextAttemptDelay, type OutboxRecord, type OutboxStore } from "./outbox";

export class SessionFlow {
  private phase: HostState["phase"] = "checking";
  private screen: ScreenId = "splash";
  private history: ScreenId[] = [];
  private error: string | null = null;
  private notice: string | null = null;
  private busy = false;
  private selectedUser: HostState["selectedUser"] = null;
  private searchResults: HostState["searchResults"] = [];
  private friends: HostState["friends"] = [];
  private incomingRequests: HostState["incomingRequests"] = [];
  private outgoingRequests: HostState["outgoingRequests"] = [];
  private conversations: HostState["conversations"] = [];
  private activeConversationId: string | null = null;
  private messages: HostState["messages"] = [];
  private messageCursor: string | null = null;
  private messageHasMore = false;
  private historyLoading = false;
  private historyError: string | null = null;
  private keyRecovery: "ready" | "needed" | "unavailable" = "ready";
  private historyEpoch = 0;
  private historyClearedAt: Record<string, string> = {};
  private notificationsClearedAt: string | null = null;
  private readonly historyCache = new Map<string, { messages: HostState["messages"]; cursor: string | null; hasMore: boolean }>();
  private notifications: HostState["notifications"] = [];
  private unreadNotifications = 0;
  private unreadMessages = 0;
  private unreadByConversation: Record<string, number> = {};
  private seenMessageIds = new Set<string>();
  private connection: HostState["connection"] = "offline";
  private toast: string | null = null;
  private toastSeq = 0;
  private devices: HostState["devices"] = [];
  private blockedUsers: HostState["blockedUsers"] = [];
  private avatars: HostState["avatars"] = {};
  private avatarMisses = new Set<string>();
  private messageLock: HostState["messageLock"] = "none";
  private notifyMessages = true;
  private notifyFriendRequests = true;
  private notifyFriendAccepted = true;
  private friendsPanel: HostState["friendsPanel"] = "friends";
  private friendsPanelSeq = 0;
  private conversationPreviews: Record<string, string> = {};
  private presenceByUser: Record<string, { status: "ONLINE" | "OFFLINE"; lastSeenAt?: string | null }> = {};
  private typing: HostState["typing"] = null;
  private typingTimer: ReturnType<typeof setTimeout> | undefined;
  private reactionPending = new Set<string>();
  private readInflight = new Set<string>();
  private readAgain = new Set<string>();
  private confirmedNotificationReads = new Set<string>();
  /** Locally read while the open chat's mark-read request is still in flight. */
  private optimisticNotificationReads = new Set<string>();
  private notificationAckInflight = new Set<string>();
  private notificationAckQueued = new Set<string>();
  private notificationAckAgain = new Set<string>();
  private notificationEpoch = 0;
  private hiddenPresence = new Set<string>();
  private imagePreviews = new Map<string, string>();
  private imageErrors = new Set<string>();
  private imageErrorText = new Map<string, string>();
  private imageFlight = new Map<string, number>();
  private imageEpoch = new Map<string, number>();
  private blockEpoch = new Map<string, number>();
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  private flushing = false;
  private readonly delivering = new Set<string>();
  constructor(
    private readonly auth: AuthService,
    private readonly onChange: () => void,
    private readonly saveFile: (name: string, bytes: Uint8Array) => Promise<void> = async () => undefined,
    private readonly log: (line: string) => void = () => undefined,
    private readonly outbox: OutboxStore = new MemoryOutbox(),
    private readonly chatCache: ChatCache = new MemoryChatCache(),
  ) {}

  reloadConfig(config: ApiConfig): void {
    const previous = this.auth.apiConfig.baseUrl;
    try {
      this.auth.reloadConfig(config);
      if (previous !== config.baseUrl) {
        this.notice = "API settings updated.";
        this.error = null;
      }
    } catch (error) {
      this.error = this.auth.userFacingError(error);
    }
    this.pushState();
  }

  private beginHistory(): number {
    this.historyEpoch += 1;
    this.historyLoading = true;
    this.historyError = null;
    return this.historyEpoch;
  }

  private resetHistory(): void {
    this.historyEpoch += 1;
    this.messageCursor = null;
    this.messageHasMore = false;
    this.historyLoading = false;
    this.historyError = null;
  }

  private contactFromBlockedUser(actorId?: string | null): boolean {
    if (!actorId) return false;
    return this.blockedUsers.some((user) => user.id === actorId) || this.hiddenPresence.has(actorId);
  }

  private hiddenByClear(conversationId: string, createdAt?: string): boolean {
    const cutoff = this.historyClearedAt[conversationId];
    return !!cutoff && !!createdAt && createdAt <= cutoff;
  }

  private applyClearFrame(frame: ServerFrame): void {
    const data = frame.data;
    if (!data || typeof data !== "object") return;
    if (frame.type === "NOTIFICATIONS_CLEARED") {
      const clearedAt = "clearedAt" in data ? (data as { clearedAt?: unknown }).clearedAt : undefined;
      if (typeof clearedAt !== "string") return;
      this.notificationsClearedAt = this.notificationsClearedAt && this.notificationsClearedAt > clearedAt
        ? this.notificationsClearedAt
        : clearedAt;
      this.notificationEpoch += 1;
      this.notifications = [];
      this.unreadNotifications = 0;
      this.pushState();
      return;
    }
    const conversationId = "conversationId" in data ? (data as { conversationId?: unknown }).conversationId : undefined;
    const clearedAt = "clearedAt" in data ? (data as { clearedAt?: unknown }).clearedAt : undefined;
    if (typeof conversationId !== "string" || typeof clearedAt !== "string") return;
    this.applyHistoryClear(conversationId, clearedAt);
  }

  /** Drops this user's visible history at the server boundary. The conversation row stays. */
  private applyHistoryClear(conversationId: string, clearedAt: string): void {
    const previous = this.historyClearedAt[conversationId];
    const cutoff = previous && previous > clearedAt ? previous : clearedAt;
    this.historyClearedAt = { ...this.historyClearedAt, [conversationId]: cutoff };
    if (this.activeConversationId === conversationId) this.historyEpoch += 1;
    if (this.activeConversationId === conversationId) {
      this.messages = visibleAfterClear(this.messages, cutoff);
      this.messageCursor = null;
      this.messageHasMore = false;
      this.historyLoading = false;
      this.historyError = null;
      this.mergePending(conversationId);
    }
    const cached = this.historyCache.get(conversationId);
    if (cached) {
      const messages = visibleAfterClear(cached.messages, cutoff);
      if (messages.length === 0) this.historyCache.delete(conversationId);
      else this.historyCache.set(conversationId, { messages, cursor: null, hasMore: false });
    }
    delete this.conversationPreviews[conversationId];
    delete this.unreadByConversation[conversationId];
    this.unreadMessages = Object.values(this.unreadByConversation).reduce((sum, count) => sum + count, 0);
    this.pushState();
  }

  private acceptHistory(opened: { conversation: { id: string }; messages: HostState["messages"]; nextCursor: string | null; hasNext: boolean }): void {
    this.activeConversationId = opened.conversation.id;
    const cutoff = this.historyClearedAt[opened.conversation.id];
    const kept = visibleAfterClear(this.messages.filter((item) => item.conversationId === opened.conversation.id), cutoff);
    const incoming = visibleAfterClear(opened.messages, cutoff);
    this.messages = incoming.length === 0 ? kept : mergeHistory(kept, incoming);
    this.messageCursor = opened.nextCursor;
    this.messageHasMore = opened.hasNext;
    this.historyLoading = false;
    this.historyError = null;
    this.mergePending(opened.conversation.id);
  }

  private rememberConversation(conversation: HostState["conversations"][number]): void {
    const index = this.conversations.findIndex((item) => item.id === conversation.id);
    if (index >= 0) {
      this.conversations = this.conversations.map((item) => item.id === conversation.id ? { ...item, ...conversation } : item);
      return;
    }
    this.conversations = [conversation, ...this.conversations];
  }

  private rememberHistoryCache(): void {
    const id = this.activeConversationId;
    if (!id || this.historyLoading || this.historyError) return;
    const messages = this.messages.filter((item) => item.conversationId === id);
    if (messages.length === 0) {
      this.historyCache.delete(id);
      return;
    }
    this.historyCache.delete(id);
    this.historyCache.set(id, { messages, cursor: this.messageCursor, hasMore: this.messageHasMore });
    while (this.historyCache.size > 8) {
      const oldest = this.historyCache.keys().next().value;
      if (oldest === undefined) break;
      this.historyCache.delete(oldest);
    }
  }

  private async openThread(message: { conversationId?: string; participantId?: string }): Promise<void> {
    if (!this.auth.isAuthenticated()) return;
    const cutoff = message.conversationId ? this.historyClearedAt[message.conversationId] : undefined;
    const cached = message.conversationId ? this.historyCache.get(message.conversationId) : undefined;
    const cachedMessages = cached ? visibleAfterClear(cached.messages, cutoff) : [];
    if (cached && cachedMessages.length > 0 && message.conversationId) {
      this.activeConversationId = message.conversationId;
      this.messages = cachedMessages;
      this.messageCursor = cached.cursor;
      this.messageHasMore = cached.hasMore;
      this.historyLoading = false;
      this.historyError = null;
      this.finishOpen(message.conversationId);
      this.pushState();
    }
    const epoch = this.beginHistory();
    if (message.conversationId) {
      this.activeConversationId = message.conversationId;
      if (cachedMessages.length === 0) this.messages = [];
    }
    this.show("messages", this.screen !== "messages");
    this.pushState();
    const started = Date.now();
    try {
      const opened = await this.auth.openConversation({
        conversationId: message.conversationId,
        participantId: message.participantId,
      });
      this.log(`history first-page conversationId=${opened.conversation.id} messages=${opened.messages.length} hasMore=${opened.hasNext} ms=${Date.now() - started}`);
      if (epoch !== this.historyEpoch) return;
      this.rememberConversation(opened.conversation);
      this.acceptHistory(opened);
      const visible = visibleAfterClear(opened.messages, this.historyClearedAt[opened.conversation.id]);
      if (
        visible.length === 0
        && opened.messages.length === 0
        && opened.conversation.updatedAt
        && opened.conversation.updatedAt !== opened.conversation.createdAt
        && !this.historyClearedAt[opened.conversation.id]
      ) {
        this.historyError = "Saved messages didn't load. Try again.";
      }
      this.finishOpen(opened.conversation.id, visible[0]?.displayText, opened.conversation.participantIds);
      this.pushState();
      this.conversations = await this.auth.listConversations();
      if (epoch === this.historyEpoch) this.pushState();
    } catch (error) {
      if (isAuthenticationFailure(error) || !this.auth.isAuthenticated()) throw error;
      if (epoch !== this.historyEpoch) return;
      this.historyLoading = false;
      this.historyError = this.auth.userFacingError(error);
      this.pushState();
    }
  }

  private finishOpen(conversationId: string, preview?: string, participantIds?: readonly string[]): void {
    if (preview) this.rememberPreview(conversationId, preview);
    for (const item of this.messages) {
      if (item.conversationId === conversationId) this.seenMessageIds.add(item.id);
    }
    delete this.unreadByConversation[conversationId];
    this.unreadMessages = Object.values(this.unreadByConversation).reduce((sum, count) => sum + count, 0);
    this.scheduleConversationRead(conversationId);
    this.scheduleNotificationRead(conversationId);
    this.show("messages", this.screen !== "messages");
    void this.syncMessageLock(participantIds);
  }

  private async loadOlderMessages(): Promise<void> {
    const conversationId = this.activeConversationId;
    const cursor = this.messageCursor;
    if (!conversationId || !cursor || !this.messageHasMore || this.historyLoading) return;
    const epoch = this.historyEpoch;
    this.historyLoading = true;
    this.historyError = null;
    this.pushState();
    const started = Date.now();
    try {
      const page = await this.auth.loadOlderMessages(conversationId, cursor);
      if (epoch !== this.historyEpoch || this.activeConversationId !== conversationId) return;
      const incoming = visibleAfterClear(page.messages, this.historyClearedAt[conversationId]);
      if (incoming.length > 0) {
        this.messages = mergeHistory(this.messages, incoming);
        this.messageCursor = page.nextCursor;
        this.messageHasMore = page.hasNext;
      } else {
        this.messageCursor = null;
        this.messageHasMore = false;
      }
      this.log(`history older-page conversationId=${conversationId} messages=${page.messages.length} hasMore=${page.hasNext} ms=${Date.now() - started}`);
    } catch (error) {
      if (epoch !== this.historyEpoch) return;
      this.historyError = this.auth.userFacingError(error);
    } finally {
      if (epoch === this.historyEpoch) {
        this.historyLoading = false;
        this.pushState();
      }
    }
  }

  snapshot(): HostState {
    const config = this.auth.apiConfig;
    return {
      ...emptyHostState(),
      phase: this.phase,
      screen: this.screen,
      canGoBack: this.screen === "user" && this.history.length > 0 && this.phase === "ready",
      authenticated: this.auth.isAuthenticated(),
      insecureHttp: config.allowInsecureHttp && config.baseUrl.startsWith("http://"),
      e2eeEnabled: this.auth.hasDeviceKeys(),
      user: this.auth.getUser() ?? null,
      selectedUser: this.selectedUser,
      error: this.error,
      notice: this.notice,
      busy: this.busy,
      searchResults: this.searchResults,
      friends: this.friends,
      incomingRequests: this.incomingRequests,
      outgoingRequests: this.outgoingRequests,
      conversations: this.conversations,
      activeConversationId: this.activeConversationId,
      messages: this.decorateMessages(this.messages),
      notifications: this.notifications,
      unreadNotifications: this.unreadNotifications,
      unreadMessages: this.unreadMessages,
      connection: this.connection,
      toast: this.toast,
      toastSeq: this.toastSeq,
      devices: this.devices,
      blockedUsers: this.blockedUsers,
      avatars: this.avatars,
      messageLock: this.messageLock,
      notifyMessages: this.notifyMessages,
      notifyFriendRequests: this.notifyFriendRequests,
      notifyFriendAccepted: this.notifyFriendAccepted,
      friendsPanel: this.friendsPanel,
      friendsPanelSeq: this.friendsPanelSeq,
      unreadByConversation: { ...this.unreadByConversation },
      conversationPreviews: { ...this.conversationPreviews },
      presenceByUser: { ...this.presenceByUser },
      typing: this.typing,
      historyHasMore: this.messageHasMore,
      historyLoading: this.historyLoading,
      historyError: this.historyError,
      keyRecovery: this.keyRecovery,
      historyClearedAt: { ...this.historyClearedAt },
    };
  }

  setNotices(prefs: { messages: boolean; friendRequests: boolean; friendAccepted: boolean }): void {
    this.notifyMessages = prefs.messages;
    this.notifyFriendRequests = prefs.friendRequests;
    this.notifyFriendAccepted = prefs.friendAccepted;
    this.pushState();
  }

  private pushState(): void {
    this.rememberHistoryCache();
    this.persistChatCache();
    this.onChange();
    this.scheduleImages();
  }

  setConnection(status: SocketStatus, recovered: boolean): void {
    const previous = this.connection;
    if (previous === status && !recovered) return;
    this.connection = status;
    if (status === "connected") {
      const accountId = this.auth.getUser()?.id;
      if (accountId) {
        for (const item of this.outbox.list(accountId)) {
          if (!item.permanent) this.outbox.save({ ...item, nextAttemptAt: 0 });
        }
      }
      this.armFlush(0);
    }
    if (status === "connected" && recovered && previous !== "connected") {
      this.toast = "Connection restored";
      this.toastSeq += 1;
      void this.reconcileQuiet();
    }
    this.pushState();
  }

  ingestFrame(frame: ServerFrame): void {
    const reaction = reactionFromFrame(frame);
    if (reaction) {
      this.messages = this.messages.map((item) => item.id === reaction.messageId ? { ...item, reactions: reaction.items } : item);
      const cached = this.historyCache.get(reaction.conversationId);
      if (cached) {
        cached.messages = cached.messages.map((item) => item.id === reaction.messageId ? { ...item, reactions: reaction.items } : item);
      }
      this.pushState();
      return;
    }
    if (frame.type === "PRESENCE_CLEAR" || frame.type === "BLOCK_STATE") {
      void this.applyBlockFrame(frame);
      return;
    }
    const presence = presenceFromFrame(frame);
    if (presence) {
      if (this.hiddenPresence.has(presence.userId)) {
        delete this.presenceByUser[presence.userId];
        this.pushState();
        return;
      }
      const next = mergePresence(this.presenceByUser[presence.userId], presence, "socket");
      if (next) this.presenceByUser[presence.userId] = next;
      else delete this.presenceByUser[presence.userId];
      if (next?.status === "OFFLINE" && this.typing?.userId === presence.userId) {
        this.typing = null;
        if (this.typingTimer) clearTimeout(this.typingTimer);
        this.typingTimer = undefined;
      }
      this.pushState();
      return;
    }
    const typing = typingFromFrame(frame);
    if (typing) {
      if (this.typingTimer) clearTimeout(this.typingTimer);
      this.typingTimer = undefined;
      if (typing.active && typing.userId !== this.auth.getUser()?.id && !this.hiddenPresence.has(typing.userId)) {
        this.typing = { conversationId: typing.conversationId, userId: typing.userId };
        this.typingTimer = setTimeout(() => {
          this.typing = null;
          this.typingTimer = undefined;
          this.pushState();
        }, 4000);
      } else if (this.typing?.conversationId === typing.conversationId) {
        this.typing = null;
      }
      this.pushState();
      return;
    }
    if (frame.type === "MESSAGE_DELETED") {
      const data = frame.data;
      const messageId = data && typeof data === "object" && "messageId" in data ? (data as { messageId?: unknown }).messageId : undefined;
      if (typeof messageId === "string") {
        const next = applyTombstone(this.messages, messageId);
        if (next) {
          this.messages = next.map((item) => this.auth.displayMessage(item));
          this.pushState();
        }
      }
      return;
    }
    if (frame.type === "MESSAGE_HIDDEN") {
      const data = frame.data;
      const messageId = data && typeof data === "object" && "messageId" in data ? (data as { messageId?: unknown }).messageId : undefined;
      const conversationId = data && typeof data === "object" && "conversationId" in data ? (data as { conversationId?: unknown }).conversationId : undefined;
      if (typeof messageId === "string") {
        this.messages = this.messages.filter((item) => item.id !== messageId);
        if (typeof conversationId === "string" && this.conversationPreviews[conversationId]) {
          const newest = this.messages.find((item) => item.conversationId === conversationId);
          if (newest) this.rememberPreview(conversationId, newest.displayText);
        }
        this.pushState();
      }
      return;
    }
    if (frame.type === "HISTORY_CLEARED" || frame.type === "NOTIFICATIONS_CLEARED") {
      this.applyClearFrame(frame);
      return;
    }
    const message = messageFromFrame(frame);
    if (message) {
      if (this.hiddenByClear(message.conversationId, message.createdAt)) return;
      const alreadySeen = this.seenMessageIds.has(message.id);
      if (alreadySeen && !message.deletedForEveryone) return;
      this.seenMessageIds.add(message.id);
      const patch = mergeLiveMessage(
        this.messages,
        message,
        this.activeConversationId,
        this.auth.getUser()?.id ?? null,
        this.toastSeq,
      );
      if (patch.messages) this.messages = patch.messages.map((item) => this.auth.displayMessage(item));
      this.rememberPreview(message.conversationId, this.auth.displayMessage(message).displayText);
      if (patch.bumpConversation) {
        this.unreadByConversation[patch.bumpConversation] = (this.unreadByConversation[patch.bumpConversation] ?? 0) + 1;
        this.unreadMessages = Object.values(this.unreadByConversation).reduce((sum, count) => sum + count, 0);
      }
      if (patch.toast) {
        this.toast = patch.toast;
        this.toastSeq = patch.toastSeq ?? this.toastSeq;
      }
      if (patch.refresh === "conversations") void this.refreshConversationsQuiet();
      const selfId = this.auth.getUser()?.id;
      if (
        this.screen === "messages"
        && message.conversationId === this.activeConversationId
        && message.senderId !== selfId
        && !message.deletedForEveryone
      ) {
        this.scheduleConversationRead(message.conversationId);
        this.scheduleNotificationRead(message.conversationId);
      }
      this.pushState();
      return;
    }
    const receipt = mergeReceipt(this.messages, frame);
    if (receipt) {
      this.messages = receipt.map((item) => this.auth.displayMessage(item));
      this.pushState();
      return;
    }
    const note = notificationFromFrame(frame);
    if (!note) return;
    if (this.notificationsClearedAt && (!note.createdAt || note.createdAt <= this.notificationsClearedAt)) return;
    if (this.contactFromBlockedUser(note.actorId) && note.type !== "SECURITY" && note.type !== "ACCOUNT") return;
    const viewingThisMessage = note.type === "NEW_MESSAGE" && !!note.referenceId && this.viewingConversation(note.referenceId);
    const incoming = viewingThisMessage && !note.read && !this.confirmedNotificationReads.has(note.id)
      ? { ...note, read: true }
      : note;
    if (incoming !== note) this.optimisticNotificationReads.add(note.id);
    const patch = mergeNotification(this.notifications, incoming, this.unreadNotifications, this.toastSeq, this.confirmedNotificationReads);
    if (patch.notifications) this.notifications = patch.notifications;
    if (patch.unreadNotifications !== undefined) this.unreadNotifications = patch.unreadNotifications;
    if (patch.toast && acceptLiveToast(note)) {
      this.toast = patch.toast;
      this.toastSeq = patch.toastSeq ?? this.toastSeq;
    }
    if (patch.refresh === "social") void this.refreshSocialQuiet();
    if (patch.refresh === "conversations") void this.refreshConversationsQuiet();
    if (note.type === "NEW_MESSAGE" && note.referenceId && this.viewingConversation(note.referenceId)) {
      this.scheduleNotificationRead(note.referenceId);
    }
    this.pushState();
  }

  private show(requested: ScreenId, recordHistory: boolean): void {
    const next = resolveScreen({
      requested,
      authenticated: this.auth.isAuthenticated(),
      checking: this.phase === "checking",
    });
    if (recordHistory && next === "user" && this.phase === "ready" && this.screen !== "user") {
      this.history = [this.screen];
    }
    if (next !== "user") this.history = [];
    this.screen = next;
    this.rememberVisibleRoute();
  }

  private rememberVisibleRoute(): void {
    if (this.phase !== "ready" || !this.auth.isAuthenticated()) return;
    if (this.screen === "user" || this.screen === "splash" || this.screen === "login" || this.screen === "signup" || this.screen === "forgot" || this.screen === "reset") return;
    this.auth.rememberRoute(this.screen, this.screen === "messages" ? this.activeConversationId : null);
  }

  private enterLogin(): void {
    this.clearPrivateState();
    this.phase = "ready";
    this.error = null;
    this.notice = null;
    this.screen = "login";
  }

  sessionExpired(): void {
    void this.auth.invalidateSession().finally(() => {
      this.enterLogin();
      this.pushState();
    });
  }

  private clearPrivateState(): void {
    this.history = [];
    this.selectedUser = null;
    this.searchResults = [];
    this.friends = [];
    this.incomingRequests = [];
    this.outgoingRequests = [];
    this.conversations = [];
    this.activeConversationId = null;
    this.messages = [];
    this.resetHistory();
    this.notifications = [];
    this.unreadNotifications = 0;
    this.unreadMessages = 0;
    this.unreadByConversation = {};
    this.presenceByUser = {};
    this.typing = null;
    if (this.typingTimer) clearTimeout(this.typingTimer);
    this.typingTimer = undefined;
    this.seenMessageIds.clear();
    this.historyCache.clear();
    this.keyRecovery = "ready";
    this.confirmedNotificationReads.clear();
    this.optimisticNotificationReads.clear();
    this.notificationAckInflight.clear();
    this.notificationAckQueued.clear();
    this.notificationAckAgain.clear();
    this.notificationEpoch += 1;
    this.notificationsClearedAt = null;
    this.historyClearedAt = {};
    this.conversationPreviews = {};
    this.toast = null;
    this.devices = [];
    this.blockedUsers = [];
    this.avatars = {};
    this.avatarMisses.clear();
    this.hiddenPresence.clear();
    this.blockEpoch.clear();
    this.imagePreviews.clear();
    this.imageErrors.clear();
    this.imageErrorText.clear();
    this.imageFlight.clear();
    this.imageEpoch.clear();
    this.messageLock = "none";
  }

  async bootstrap(): Promise<void> {
    this.phase = "checking";
    this.screen = "splash";
    this.error = null;
    this.pushState();
    try {
      if (!this.auth.isAuthenticated()) {
        this.enterLogin();
        return;
      }
      await this.auth.refreshProfile();
      if (!this.auth.isAuthenticated()) {
        this.enterLogin();
        return;
      }
      await this.loadShell();
      this.phase = "ready";
      await this.restoreRoute();
      this.armFlush(0);
    } catch (error) {
      if (isAuthenticationFailure(error) || !this.auth.isAuthenticated()) {
        await this.auth.invalidateSession();
        this.enterLogin();
        return;
      }
      this.restoreOfflineShell();
    } finally {
      this.pushState();
    }
  }

  private restoreOfflineShell(): void {
    const accountId = this.auth.getUser()?.id;
    this.phase = "ready";
    this.connection = "offline";
    this.error = null;
    if (accountId) {
      const snapshot = this.chatCache.load(accountId);
      if (snapshot) {
        this.conversations = [...snapshot.conversations];
        this.historyClearedAt = { ...(snapshot.clearedAt ?? {}) };
        for (const [id, thread] of Object.entries(snapshot.threads)) {
          const messages = visibleAfterClear(thread.messages, this.historyClearedAt[id]);
          if (messages.length === 0) continue;
          const trimmed = messages.length !== thread.messages.length;
          this.historyCache.set(id, {
            messages,
            cursor: trimmed ? null : thread.cursor,
            hasMore: trimmed ? false : thread.hasMore,
          });
        }
      }
    }
    const route = this.auth.lastRoute();
    const screen = route?.screen;
    if (screen === "messages" && route?.conversationId) {
      const cached = this.historyCache.get(route.conversationId);
      this.activeConversationId = route.conversationId;
      this.messages = cached ? [...cached.messages] : [];
      this.messageCursor = cached?.cursor ?? null;
      this.messageHasMore = cached?.hasMore ?? false;
      this.mergePending(route.conversationId);
      this.show("messages", false);
      return;
    }
    if (screen === "search" || screen === "friends" || screen === "messages" || screen === "notifications" || screen === "profile" || screen === "settings" || screen === "home") {
      this.show(screen, false);
      return;
    }
    this.show("home", false);
  }

  private persistChatCache(): void {
    const accountId = this.auth.getUser()?.id;
    if (!accountId || this.phase !== "ready") return;
    const threads: Record<string, { messages: HostState["messages"]; cursor: string | null; hasMore: boolean }> = {};
    for (const [id, thread] of this.historyCache) {
      threads[id] = { messages: thread.messages, cursor: thread.cursor, hasMore: thread.hasMore };
    }
    try {
      this.chatCache.save(accountId, { conversations: this.conversations, threads, clearedAt: this.historyClearedAt });
    } catch (error) {
      this.log(`chat cache skipped: ${error instanceof Error ? error.name : "error"}`);
    }
  }

  private localId(clientMessageId: string): string {
    return `local-${clientMessageId}`;
  }

  private mergePending(conversationId: string): void {
    const accountId = this.auth.getUser()?.id;
    if (!accountId) return;
    for (const item of this.outbox.list(accountId)) {
      if (item.conversationId !== conversationId) continue;
      const localId = this.localId(item.clientMessageId);
      if (this.messages.some((message) => message.id === localId)) continue;
      this.messages = [this.localMessage(item), ...this.messages];
    }
  }

  private localMessage(item: OutboxRecord): HostState["messages"][number] {
    const files = item.files?.map((file, index) => {
      const bytes = this.outbox.readFile(item.accountId, file.relativePath);
      return {
        id: `${this.localId(item.clientMessageId)}-${index}`,
        name: file.name,
        size: bytes?.byteLength ?? 0,
        mime: file.mime,
        key: "",
        iv: "",
        preview: bytes && file.mime.startsWith("image/") && bytes.byteLength <= 8_000_000
          ? `data:${file.mime};base64,${Buffer.from(bytes).toString("base64")}`
          : undefined,
      };
    });
    return {
      id: this.localId(item.clientMessageId),
      conversationId: item.conversationId,
      senderId: item.accountId,
      recipientId: this.peerId() ?? "peer",
      ciphertext: "",
      messageType: item.messageType ?? "TEXT",
      status: "SENT",
      createdAt: item.createdAt,
      displayText: item.displayText,
      sendState: item.permanent ? "failed" : item.attempts > 0 ? "pending" : "sending",
      sendError: item.error,
      media: item.media,
      attachments: files,
    };
  }

  private showQueued(item: OutboxRecord, sendState: "sending" | "pending" | "failed"): void {
    const localId = this.localId(item.clientMessageId);
    const next = { ...this.localMessage(item), sendState, sendError: item.error };
    const place = (messages: HostState["messages"]): HostState["messages"] => messages.some((message) => message.id === localId)
      ? messages.map((message) => message.id === localId ? next : message)
      : [next, ...messages];
    if (this.activeConversationId === item.conversationId) {
      this.messages = place(this.messages);
      return;
    }
    const cached = this.historyCache.get(item.conversationId);
    this.historyCache.set(item.conversationId, {
      messages: place(cached?.messages ?? []),
      cursor: cached?.cursor ?? null,
      hasMore: cached?.hasMore ?? false,
    });
  }

  private async enqueue(record: OutboxRecord): Promise<void> {
    this.outbox.save(record);
    this.showQueued(record, "sending");
    this.pushState();
    await this.attemptDelivery(record);
  }

  private async retryQueued(clientMessageId: string): Promise<void> {
    const accountId = this.auth.getUser()?.id;
    if (!accountId) return;
    const item = this.outbox.list(accountId).find((entry) => entry.clientMessageId === clientMessageId);
    if (!item) return;
    const next = { ...item, permanent: false, attempts: 0, nextAttemptAt: 0, error: undefined };
    this.outbox.save(next);
    this.showQueued(next, "sending");
    this.pushState();
    await this.attemptDelivery(next);
  }

  private armFlush(delayMs: number): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      void this.flushOutbox();
    }, Math.max(0, delayMs));
  }

  private async flushOutbox(): Promise<void> {
    if (this.flushing) return;
    const accountId = this.auth.getUser()?.id;
    if (!accountId || !this.auth.isAuthenticated()) return;
    this.flushing = true;
    try {
      const now = Date.now();
      const due = this.outbox.list(accountId)
        .filter((item) => !item.permanent && item.nextAttemptAt <= now)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.clientMessageId.localeCompare(right.clientMessageId));
      for (const item of due) {
        if (this.auth.getUser()?.id !== accountId) break;
        await this.attemptDelivery(item);
      }
    } finally {
      this.flushing = false;
    }
    const account = this.auth.getUser()?.id;
    if (!account || !this.auth.isAuthenticated()) return;
    const waiting = this.outbox.list(account).filter((item) => !item.permanent);
    if (waiting.length === 0) return;
    const next = Math.min(...waiting.map((item) => item.nextAttemptAt));
    this.armFlush(Math.max(0, next - Date.now()));
  }

  private async attemptDelivery(item: OutboxRecord): Promise<void> {
    const key = `${item.accountId}:${item.clientMessageId}`;
    if (this.delivering.has(key) || item.permanent) return;
    if (this.auth.getUser()?.id !== item.accountId) return;
    this.delivering.add(key);
    let current = item;
    try {
      if (current.kind === "files") {
        const files = (current.files ?? []).map((file) => {
          const bytes = this.outbox.readFile(current.accountId, file.relativePath);
          return { name: file.name, mime: file.mime, bytes: Buffer.from(bytes ?? new Uint8Array()) };
        });
        if (files.length < 1 || files.some((file) => file.bytes.length < 1)) {
          throw new ApiError("request", "The attachment is no longer available on this device. Choose it again.");
        }
        const sent = await this.auth.sendFiles(current.conversationId, current.caption ?? "", files, current.clientMessageId);
        this.finishQueued(current, sent);
        return;
      }
      if (!current.ciphertext) {
        const plaintext = current.plaintext ?? (current.media ? encodeMediaPayload(current.media.kind, current.media.id) : "");
        if (!plaintext) throw new ApiError("request", "This message could not be prepared.");
        const prepared = await this.auth.preparePlaintext(current.conversationId, plaintext, current.clientMessageId, "TEXT");
        current = { ...current, ciphertext: prepared.ciphertext, deviceId: prepared.deviceId, keyId: prepared.keyId, messageType: "TEXT", plaintext: undefined };
        this.outbox.save(current);
      }
      if (!current.ciphertext || !current.deviceId || !current.keyId || !current.messageType) {
        throw new ApiError("request", "This message could not be prepared.");
      }
      const sent = await this.auth.deliverPrepared(current.conversationId, {
        ciphertext: current.ciphertext,
        messageType: current.messageType,
        clientMessageId: current.clientMessageId,
        deviceId: current.deviceId,
        keyId: current.keyId,
      });
      this.finishQueued(current, sent);
    } catch (error) {
      const detail = this.auth.userFacingError(error);
      const permanent = isPermanentDeliveryError(error) || /encryption key|not registered|can't interact|Only friends can exchange messages|Key material is available to friends|Only friends can start a conversation|no longer available/.test(detail);
      const attempts = current.attempts + 1;
      const failed = {
        ...current,
        attempts,
        permanent,
        nextAttemptAt: permanent ? current.nextAttemptAt : Date.now() + nextAttemptDelay(attempts),
        error: detail,
      };
      this.outbox.save(failed);
      this.showQueued(failed, permanent ? "failed" : "pending");
      if (permanent && /can't interact|Only friends/.test(detail)) await this.syncMessageLock();
      this.log(`outbox ${current.clientMessageId} attempt=${attempts} permanent=${permanent}`);
      this.pushState();
    } finally {
      this.delivering.delete(key);
    }
  }

  private finishQueued(item: OutboxRecord, sent: HostState["messages"][number]): void {
    this.outbox.remove(item.accountId, item.clientMessageId);
    const localId = this.localId(item.clientMessageId);
    for (const file of sent.attachments ?? []) {
      if (file.preview) this.rememberImage(file.id, file.preview);
    }
    this.seenMessageIds.add(sent.id);
    const place = (messages: HostState["messages"]): HostState["messages"] => [sent, ...messages.filter((message) => message.id !== sent.id && message.id !== localId)];
    if (this.activeConversationId === item.conversationId) this.messages = place(this.messages);
    const cached = this.historyCache.get(item.conversationId);
    if (cached) {
      this.historyCache.set(item.conversationId, { ...cached, messages: place(cached.messages) });
    }
    this.rememberPreview(item.conversationId, sent.displayText);
    this.pushState();
  }

  private async restoreRoute(): Promise<void> {
    const route = this.auth.lastRoute();
    const screen = route?.screen;
    if (screen === "messages" && route?.conversationId) {
      try {
        await this.openThread({ conversationId: route.conversationId });
        return;
      } catch (error) {
        if (isAuthenticationFailure(error) || !this.auth.isAuthenticated()) throw error;
      }
    }
    if (screen === "search" || screen === "friends" || screen === "messages" || screen === "notifications" || screen === "profile" || screen === "settings") {
      this.show(screen, false);
      return;
    }
    this.show("home", false);
  }

  private async loadShell(): Promise<void> {
    const [social, conversations, notes] = await Promise.all([
      this.auth.loadSocial(),
      this.auth.listConversations(),
      this.auth.loadNotifications(),
    ]);
    this.friends = social.friends;
    this.incomingRequests = social.incoming;
    this.outgoingRequests = social.outgoing;
    this.absorbPresence([
      ...social.friends,
      ...social.incoming.map((item) => item.counterpart),
      ...social.outgoing.map((item) => item.counterpart),
    ]);
    this.conversations = conversations;
    this.applyServerNotifications(notes.items, notes.unreadCount);
    try {
      this.blockedUsers = await this.auth.blockedUsers();
    } catch {
      this.blockedUsers = [];
    }
    this.keyRecovery = this.auth.prepareDeviceKeys
      ? await this.auth.prepareDeviceKeys()
      : (await this.auth.ensureDeviceKeys(), "ready");
  }

  async handleMessage(rawMessage: unknown): Promise<void> {
    const result = webviewMessageSchema.safeParse(rawMessage);
    if (!result.success) return;
    if (this.phase === "checking" && result.data.type !== "retry") return;
    const message = result.data;

    if (message.type === "ready") {
      this.pushState();
      return;
    }
    if (message.type === "back") {
      const previous = this.history.pop() ?? (this.auth.isAuthenticated() ? "home" : "login");
      this.screen = resolveScreen({
        requested: previous,
        authenticated: this.auth.isAuthenticated(),
        checking: false,
      });
      this.error = null;
      this.pushState();
      return;
    }
    if (message.type === "closeThread") {
      this.activeConversationId = null;
      this.messages = [];
      this.resetHistory();
      this.messageLock = "none";
      this.error = null;
      this.pushState();
      return;
    }
    if (message.type === "loadOlderMessages") {
      void this.loadOlderMessages();
      return;
    }
    if (message.type === "openConversation") {
      await this.openThread(message);
      return;
    }
    if (message.type === "navigate") {
      this.error = null;
      if (message.destination === "messages" && this.screen === "messages") {
        this.activeConversationId = null;
        this.messageLock = "none";
      }
      this.show(message.destination, true);
      this.pushState();
      if (this.auth.isAuthenticated() && message.destination === "settings") {
        await this.run({ version: 1, type: "loadDevices" });
      }
      return;
    }
    if (message.type === "retry") {
      if (!this.auth.isAuthenticated() || this.screen === "splash") {
        await this.bootstrap();
        return;
      }
      await this.refreshFor(this.screen);
      return;
    }

    await this.run(message);
  }

  private async acknowledge(notificationId: string): Promise<void> {
    if (this.confirmedNotificationReads.has(notificationId)) {
      this.optimisticNotificationReads.delete(notificationId);
      return;
    }
    if (this.notificationAckInflight.has(notificationId)) return;
    this.notificationAckInflight.add(notificationId);
    try {
      const updated = await this.auth.markNotificationRead(notificationId);
      this.confirmedNotificationReads.add(updated.id);
      this.optimisticNotificationReads.delete(updated.id);
      this.notificationEpoch += 1;
      const applied = applyNotificationRead(this.notifications, this.unreadNotifications, updated);
      this.notifications = applied.notifications;
      this.unreadNotifications = applied.unreadCount;
      try {
        await this.fetchNotifications();
      } catch {
        // The confirmed read response remains in the local list.
      }
    } finally {
      this.notificationAckInflight.delete(notificationId);
    }
  }

  private viewingConversation(conversationId: string): boolean {
    return this.screen === "messages" && this.activeConversationId === conversationId;
  }

  private protectedNotificationReads(): ReadonlySet<string> {
    if (this.optimisticNotificationReads.size === 0) return this.confirmedNotificationReads;
    return new Set([...this.confirmedNotificationReads, ...this.optimisticNotificationReads]);
  }

  private revertOptimisticRead(notificationId: string): void {
    if (!this.optimisticNotificationReads.delete(notificationId)) return;
    if (this.confirmedNotificationReads.has(notificationId)) return;
    const existing = this.notifications.find((item) => item.id === notificationId);
    if (!existing || !existing.read) return;
    this.notifications = this.notifications.map((item) => item.id === notificationId ? { ...item, read: false } : item);
    this.unreadNotifications += 1;
  }

  private revertOptimisticConversation(conversationId: string): void {
    for (const id of [...this.optimisticNotificationReads]) {
      const note = this.notifications.find((item) => item.id === id);
      if (note?.type === "NEW_MESSAGE" && note.referenceId === conversationId) this.revertOptimisticRead(id);
    }
  }

  private applyServerNotifications(items: HostState["notifications"], unreadCount: number): void {
    const visible = dropClearedNotifications(items, this.notificationsClearedAt);
    const unread = this.notificationsClearedAt
      ? visible.reduce((count, note) => count + (note.read ? 0 : 1), 0)
      : unreadCount;
    const absorbed = absorbServerNotifications(visible, unread, this.protectedNotificationReads());
    this.notifications = absorbed.notifications;
    this.unreadNotifications = absorbed.unreadCount;
  }

  /** Applies a list only when no read confirmation landed after this request started. */
  private async fetchNotifications(): Promise<boolean> {
    const epoch = this.notificationEpoch;
    const notes = await this.auth.loadNotifications();
    if (epoch !== this.notificationEpoch) return false;
    this.applyServerNotifications(notes.items, notes.unreadCount);
    return true;
  }

  /** Marks every unread message notification for this conversation. Other types and conversations stay unread. */
  private async acknowledgeConversation(conversationId: string, onlyWhileViewing = false): Promise<void> {
    const allowed = () => !onlyWhileViewing || this.viewingConversation(conversationId);
    if (!allowed()) {
      this.revertOptimisticConversation(conversationId);
      return;
    }
    let pending = this.notifications.filter((note) => note.type === "NEW_MESSAGE"
      && note.referenceId === conversationId
      && !this.confirmedNotificationReads.has(note.id)
      && (!note.read || this.optimisticNotificationReads.has(note.id)));
    if (pending.length === 0) {
      const epoch = this.notificationEpoch;
      const notes = await this.auth.loadNotifications();
      if (!allowed() || epoch !== this.notificationEpoch) {
        this.revertOptimisticConversation(conversationId);
        return;
      }
      for (const item of notes.items) {
        if (this.notifications.some((note) => note.id === item.id)) continue;
        const patch = mergeNotification(this.notifications, item, this.unreadNotifications, this.toastSeq, this.confirmedNotificationReads);
        if (patch.notifications) this.notifications = patch.notifications;
        if (patch.unreadNotifications !== undefined) this.unreadNotifications = patch.unreadNotifications;
      }
      pending = unreadMessageNotificationsForConversation(this.notifications, conversationId);
    }
    for (const note of pending) {
      if (!allowed()) {
        this.revertOptimisticConversation(conversationId);
        return;
      }
      try {
        await this.acknowledge(note.id);
      } catch {
        this.revertOptimisticRead(note.id);
      }
    }
  }

  private scheduleNotificationRead(conversationId: string): void {
    if (!this.viewingConversation(conversationId)) return;
    if (this.notificationAckQueued.has(conversationId)) {
      this.notificationAckAgain.add(conversationId);
      return;
    }
    this.notificationAckQueued.add(conversationId);
    void this.acknowledgeConversation(conversationId, true).catch(() => undefined).finally(() => {
      this.notificationAckQueued.delete(conversationId);
      this.pushState();
      if (!this.notificationAckAgain.delete(conversationId)) return;
      this.scheduleNotificationRead(conversationId);
    });
  }

  private async acknowledgeTarget(notificationId?: string, conversationId?: string): Promise<void> {
    try {
      if (notificationId) await this.acknowledge(notificationId);
      else if (conversationId) await this.acknowledgeConversation(conversationId);
    } catch {
      // Opening the destination does not depend on the read request.
    }
  }

  async focusTarget(target: { screen: ScreenId; conversationId?: string; userId?: string; notificationId?: string; friendsPanel?: "requests" }): Promise<void> {
    if (!this.auth.isAuthenticated()) {
      this.phase = "ready";
      this.show("login", false);
      this.pushState();
      return;
    }
    if (this.phase === "checking") return;
    try {
    await this.acknowledgeTarget(target.notificationId, target.conversationId);
    this.pushState();
    if (target.conversationId) {
      await this.openThread({ conversationId: target.conversationId });
    } else if (target.userId) {
      this.selectedUser = await this.auth.getUserById(target.userId);
      this.show("user", false);
    } else {
      if (target.friendsPanel) {
        this.friendsPanel = target.friendsPanel;
        this.friendsPanelSeq += 1;
      }
      this.show(target.screen, false);
    }
    this.pushState();
    } catch (error) {
      if (isAuthenticationFailure(error) || !this.auth.isAuthenticated()) {
        await this.auth.invalidateSession();
        this.enterLogin();
      } else {
        this.error = this.auth.userFacingError(error);
      }
      this.pushState();
    }
  }

  private async refreshFor(screen: ScreenId): Promise<void> {
    if (screen === "friends") await this.run({ version: 1, type: "loadSocial" });
    if (screen === "messages") await this.run({ version: 1, type: "loadConversations" });
    if (screen === "notifications") await this.run({ version: 1, type: "loadNotifications" });
    if (screen === "settings") await this.run({ version: 1, type: "loadDevices" });
    if (screen === "profile") await this.run({ version: 1, type: "refreshProfile" });
  }

  private async run(message: ReturnType<typeof webviewMessageSchema.parse>): Promise<void> {
    if (this.busy || this.phase === "checking") return;
    if (!this.auth.isAuthenticated() && !["login", "signup", "forgotPassword", "resetPassword"].includes(message.type)) {
      this.show("login", false);
      this.error = "Sign in to continue.";
      this.pushState();
      return;
    }

    this.busy = true;
    this.error = null;
    this.notice = null;
    this.pushState();
    try {
      switch (message.type) {
        case "login":
          await this.auth.login({
            usernameOrEmail: message.usernameOrEmail,
            password: message.password,
          });
          this.clearPrivateState();
          this.show("home", false);
          this.notice = "Signed in.";
          await this.loadShell();
          this.armFlush(0);
          break;
        case "signup":
          await this.auth.signup({
            username: message.username,
            email: message.email,
            password: message.password,
            displayName: message.displayName,
          });
          this.clearPrivateState();
          this.show("home", false);
          this.notice = "Account created.";
          await this.loadShell();
          this.armFlush(0);
          break;
        case "forgotPassword":
          await this.auth.forgotPassword(message.email);
          this.show("reset", true);
          this.notice = "If that email can receive mail, reset instructions were sent.";
          break;
        case "resetPassword":
          await this.auth.resetPassword(message.token, message.newPassword);
          this.history = [];
          this.show("login", false);
          this.notice = "Password updated. Sign in with the new password.";
          break;
        case "changePassword":
          await this.auth.changePassword(message.currentPassword, message.newPassword);
          this.clearPrivateState();
          this.show("login", false);
          this.notice = "Password changed. Sign in again.";
          break;
        case "logout":
          await this.auth.logout();
          this.clearPrivateState();
          this.show("login", false);
          this.notice = "Signed out.";
          break;
        case "refreshProfile":
          await this.auth.refreshProfile();
          break;
        case "resendVerification":
          await this.auth.resendVerification();
          this.notice = "Verification email requested.";
          break;
        case "updateProfile": {
          const previous = this.auth.getUser()?.accountType;
          await this.auth.updateProfile({
            displayName: message.displayName,
            bio: message.bio,
            accountType: message.accountType,
            clearProfileImage: message.clearProfileImage,
            showActivityStatus: message.showActivityStatus,
          });
          this.notice = previous && message.accountType && previous !== message.accountType
            ? `Account is now ${message.accountType === "PRIVATE" ? "private" : "public"}.`
            : "Profile saved.";
          break;
        }
        case "uploadAvatar": {
          const bytes = Buffer.from(message.dataBase64, "base64");
          if (bytes.length === 0 || bytes.length > 2_097_152) {
            throw new Error("Profile picture is too large.");
          }
          await this.auth.uploadAvatar(bytes, message.contentType);
          this.avatarMisses.clear();
          this.notice = "Profile picture updated.";
          break;
        }
        case "removeAvatar":
          await this.auth.removeAvatar();
          this.notice = "Profile picture removed.";
          break;
        case "searchUsers":
          this.searchResults = await this.auth.searchUsers(message.query);
          this.notice = this.searchResults.length ? `${this.searchResults.length} result(s).` : "No users found.";
          break;
        case "openUser":
          this.selectedUser = await this.auth.getUserById(message.userId);
          this.show("user", true);
          break;
        case "loadSocial": {
          const social = await this.auth.loadSocial();
          this.friends = social.friends;
          this.incomingRequests = social.incoming;
          this.outgoingRequests = social.outgoing;
          break;
        }
        case "sendFriendRequest":
          await this.auth.sendFriendRequest(message.userId);
          this.notice = "Friend request sent.";
          await this.refreshSocialAndUser(message.userId);
          break;
        case "acceptFriendRequest":
          await this.auth.acceptFriendRequest(message.requestId);
          this.notice = "Friend request accepted.";
          await this.refreshSocialAndUser();
          break;
        case "rejectFriendRequest":
          await this.auth.rejectFriendRequest(message.requestId);
          this.notice = "Friend request rejected.";
          await this.refreshSocialAndUser();
          break;
        case "removeFriend":
          await this.auth.removeFriend(message.userId);
          this.notice = "Friend removed.";
          await this.refreshSocialAndUser(message.userId);
          break;
        case "blockUser":
          await this.auth.blockUser(message.userId);
          this.notice = "User blocked.";
          this.searchResults = this.searchResults.filter((user) => user.id !== message.userId);
          this.blockedUsers = await this.auth.blockedUsers();
          if (this.peerId() === message.userId) {
            this.messageLock = "blocked-by-me";
          }
          this.friends = this.friends.filter((user) => user.id !== message.userId);
          this.conversations = await this.auth.listConversations();
          await this.refreshSocialAndUser(message.userId);
          break;
        case "unblockUser":
          await this.auth.unblockUser(message.userId);
          this.notice = "User unblocked.";
          this.blockedUsers = this.blockedUsers.filter((user) => user.id !== message.userId);
          if (this.peerId() === message.userId) await this.syncMessageLock();
          this.conversations = await this.auth.listConversations();
          await this.refreshSocialAndUser(message.userId);
          break;
        case "loadConversations":
          this.conversations = await this.auth.listConversations();
          break;
        case "deleteMessage": {
          const updated = await this.auth.deleteMessage(message.messageId, message.scope);
          if (message.scope === "me") {
            this.messages = this.messages.filter((item) => item.id !== message.messageId);
          } else {
            this.messages = this.messages.map((item) => item.id === message.messageId ? updated : item);
          }
          this.pushState();
          break;
        }
        case "sendMedia": {
          if (this.messageLock !== "none") {
            this.error = this.messageLock === "blocked-by-me" ? "You blocked this user." : "You can't message this user.";
            break;
          }
          const accountId = this.auth.getUser()?.id;
          if (!accountId) break;
          const label = message.kind === "sticker" ? "Sticker" : "GIF";
          await this.enqueue({
            accountId,
            conversationId: message.conversationId,
            clientMessageId: createClientMessageId(),
            kind: "media",
            createdAt: new Date().toISOString(),
            attempts: 0,
            nextAttemptAt: 0,
            permanent: false,
            displayText: label,
            media: { kind: message.kind, id: message.id },
            messageType: "TEXT",
          });
          break;
        }
        case "setReaction":
        case "clearReaction": {
          const current = this.messages.find((item) => item.id === message.messageId);
          if (!current || this.reactionPending.has(current.id)) break;
          const selfId = this.auth.getUser()?.id;
          if (!selfId) break;
          const previous = current.reactions ?? [];
          const emoji = message.type === "setReaction" ? message.emoji : null;
          const next = applyUserReaction(previous, selfId, emoji);
          this.reactionPending.add(current.id);
          this.messages = this.messages.map((item) => item.id === current.id ? { ...item, reactions: next } : item);
          this.pushState();
          try {
            const saved = message.type === "setReaction"
              ? await this.auth.setReaction(current.conversationId, current.id, message.emoji)
              : await this.auth.clearReaction(current.conversationId, current.id);
            this.messages = this.messages.map((item) => item.id === saved.messageId ? { ...item, reactions: saved.items } : item);
          } catch (error) {
            this.messages = this.messages.map((item) => item.id === current.id ? { ...item, reactions: previous } : item);
            this.error = this.auth.userFacingError(error);
          } finally {
            this.reactionPending.delete(current.id);
          }
          break;
        }
        case "retryOutbox": {
          await this.retryQueued(message.clientMessageId);
          break;
        }
        case "sendMessage": {
          if (this.messageLock !== "none") {
            this.error = this.messageLock === "blocked-by-me"
              ? "You blocked this user."
              : "You can't message this user.";
            break;
          }
          const accountId = this.auth.getUser()?.id;
          if (!accountId) break;
          await this.enqueue({
            accountId,
            conversationId: message.conversationId,
            clientMessageId: createClientMessageId(),
            kind: "text",
            createdAt: new Date().toISOString(),
            attempts: 0,
            nextAttemptAt: 0,
            permanent: false,
            displayText: message.text,
            plaintext: message.text,
            messageType: "TEXT",
          });
          this.activeConversationId = message.conversationId;
          break;
        }
        case "sendFiles":
        case "retryFiles": {
          if (message.type === "retryFiles") {
            const clientMessageId = message.localId.startsWith("local-") ? message.localId.slice("local-".length) : message.localId;
            await this.retryQueued(clientMessageId);
            break;
          }
          const accountId = this.auth.getUser()?.id;
          if (!accountId) break;
          const text = message.text ?? "";
          const files = message.files.map((file) => ({ name: file.name, mime: file.mime, bytes: Buffer.from(file.base64, "base64") }));
          if (files.length < 1) break;
          if (this.messageLock !== "none") {
            this.error = this.messageLock === "blocked-by-me" ? "You blocked this user." : "You can't message this user.";
            break;
          }
          if (files.some((file) => isRiskyFile(file.name)) && !message.confirmedRisky) {
            this.error = "That file type needs confirmation before it can be sent.";
            break;
          }
          const clientMessageId = createClientMessageId();
          const stored = files.map((file, index) => ({
            name: file.name,
            mime: file.mime,
            relativePath: this.outbox.writeFile(accountId, clientMessageId, index, file.bytes),
          }));
          const label = text.trim() || files.map((file) => file.name).join(", ");
          await this.enqueue({
            accountId,
            conversationId: message.conversationId,
            clientMessageId,
            kind: "files",
            createdAt: new Date().toISOString(),
            attempts: 0,
            nextAttemptAt: 0,
            permanent: false,
            displayText: label,
            caption: text,
            messageType: files.every((file) => file.mime.startsWith("image/")) ? "IMAGE" : "FILE",
            files: stored,
          });
          this.activeConversationId = message.conversationId;
          break;
        }
        case "downloadFile": {
          const bytes = await this.auth.downloadAttachment(message.id, message.key, message.iv);
          await this.saveFile(message.name.replace(/[\\/]/g, "_"), bytes);
          break;
        }
        case "reloadImage": {
          this.imageEpoch.set(message.attachmentId, (this.imageEpoch.get(message.attachmentId) ?? 0) + 1);
          this.imageErrors.delete(message.attachmentId);
          this.imageErrorText.delete(message.attachmentId);
          this.imagePreviews.delete(message.attachmentId);
          this.imageFlight.delete(message.attachmentId);
          this.pushState();
          break;
        }
        case "saveAttachment": {
          const file = this.messages.flatMap((item) => item.id === message.messageId ? [...(item.attachments ?? [])] : [])
            .find((item) => item.id === message.attachmentId);
          if (!file?.key) break;
          const bytes = await this.auth.downloadAttachment(file.id, file.key, file.iv);
          await this.saveFile(file.name.replace(/[\\/]/g, "_"), bytes);
          break;
        }
        case "previewFile": {
          const bytes = await this.auth.downloadAttachment(message.id, message.key, message.iv);
          if (!message.mime.startsWith("image/") || bytes.byteLength > 8_000_000) break;
          this.rememberImage(message.id, `data:${message.mime};base64,${Buffer.from(bytes).toString("base64")}`);
          this.imageErrors.delete(message.id);
          break;
        }
        case "loadNotifications": {
          await this.fetchNotifications();
          break;
        }
        case "openNotification": {
          let note = this.notifications.find((item) => item.id === message.notificationId);
          if (!note) {
            const epoch = this.notificationEpoch;
            const notes = await this.auth.loadNotifications();
            if (epoch === this.notificationEpoch) this.applyServerNotifications(notes.items, notes.unreadCount);
            note = this.notifications.find((item) => item.id === message.notificationId);
          }
          if (!note) break;
          if (!note.read) {
            try {
              await this.acknowledge(note.id);
            } catch {
              // The destination still opens when the read request fails.
            }
            this.pushState();
          }
          if (note?.type === "NEW_MESSAGE" && note.referenceId) {
            void this.openThread({ conversationId: note.referenceId });
          } else if (note?.type === "FRIEND_REQUEST_ACCEPTED" && note.actorId) {
            this.selectedUser = await this.auth.getUserById(note.actorId);
            this.show("user", true);
          } else if (note) {
            if (note.type === "FRIEND_REQUEST") {
              this.friendsPanel = "requests";
              this.friendsPanelSeq += 1;
            }
            this.show(notificationDestination(note.type), true);
            if (note.type === "FRIEND_REQUEST") {
              const social = await this.auth.loadSocial();
              this.friends = social.friends;
              this.incomingRequests = social.incoming;
              this.outgoingRequests = social.outgoing;
              if (note.referenceId && !social.incoming.some((request) => request.id === note.referenceId)) {
                this.notice = "This request is no longer available.";
              }
            }
          }
          break;
        }
        case "markNotificationRead": {
          await this.acknowledge(message.notificationId);
          break;
        }
        case "clearNotifications": {
          const result = await this.auth.clearNotifications();
          this.notificationsClearedAt = result.clearedAt;
          this.notificationEpoch += 1;
          this.notifications = [];
          this.unreadNotifications = 0;
          this.confirmedNotificationReads.clear();
          this.optimisticNotificationReads.clear();
          this.notice = result.cleared === 0 ? "Notifications are already clear." : "Notifications cleared.";
          break;
        }
        case "clearChat": {
          const clearedAt = await this.auth.clearConversation(message.conversationId);
          this.applyHistoryClear(message.conversationId, clearedAt);
          this.notice = "Chat cleared. The other person still has their messages.";
          break;
        }
        case "markAllNotificationsRead": {
          await this.auth.markAllNotificationsRead();
          this.notificationEpoch += 1;
          const notes = await this.auth.loadNotifications();
          for (const item of notes.items) {
            if (item.read) this.confirmedNotificationReads.add(item.id);
          }
          this.applyServerNotifications(notes.items, notes.unreadCount);
          this.notice = "Notifications marked read.";
          break;
        }
        case "saveRecovery":
          await this.auth.saveRecovery(message.passphrase);
          this.keyRecovery = "ready";
          this.notice = "Recovery passphrase saved. A new installation can open this device's messages with it.";
          break;
        case "restoreRecovery":
          await this.auth.restoreRecovery(message.passphrase);
          this.keyRecovery = "ready";
          if (this.activeConversationId) await this.openThread({ conversationId: this.activeConversationId });
          this.notice = "This device restored the previous installation's key.";
          break;
        case "skipRecovery":
          await this.auth.skipRecovery();
          this.keyRecovery = "ready";
          this.notice = "This device has its own key. Messages sealed to the previous installation stay unreadable.";
          break;
        case "loadDevices":
          this.devices = await this.auth.listDevices();
          this.blockedUsers = await this.auth.blockedUsers();
          break;
        case "revokeDevice":
          await this.auth.revokeDevice(message.deviceId);
          this.devices = await this.auth.listDevices();
          this.notice = "Device revoked.";
          break;
        default:
          break;
      }
    } catch (error) {
      const signingIn = message.type === "login" || message.type === "signup" || message.type === "forgotPassword" || message.type === "resetPassword";
      if (!signingIn && (isAuthenticationFailure(error) || !this.auth.isAuthenticated())) {
        await this.auth.invalidateSession();
        this.enterLogin();
      } else {
        this.error = this.auth.userFacingError(error);
      }
      if (message.type === "openConversation") this.historyLoading = false;
    } finally {
      this.busy = false;
      this.pushState();
      if (this.auth.isAuthenticated()) void this.warmAvatars().then(() => this.pushState());
    }
  }

  private async applyBlockFrame(frame: ServerFrame): Promise<void> {
    const data = frame.data;
    if (!data || typeof data !== "object" || !("userId" in data)) return;
    const userId = (data as { userId?: unknown }).userId;
    if (typeof userId !== "string") return;
    if (frame.type === "PRESENCE_CLEAR") {
      this.hiddenPresence.add(userId);
      delete this.presenceByUser[userId];
      if (this.typing?.userId === userId) this.typing = null;
      this.pushState();
      return;
    }
    const epoch = (this.blockEpoch.get(userId) ?? 0) + 1;
    this.blockEpoch.set(userId, epoch);
    let status: { blockedByMe: boolean; blockedMe: boolean };
    try {
      status = await this.auth.blockStatus(userId);
    } catch {
      const reported = data as { blockedByMe?: unknown; blockedMe?: unknown };
      const blockedByMe = reported.blockedByMe === true;
      const blockedMe = reported.blockedMe === true;
      if (!blockedByMe && !blockedMe) return;
      status = { blockedByMe, blockedMe };
    }
    if (this.blockEpoch.get(userId) !== epoch) return;
    const locked = status.blockedByMe || status.blockedMe;
    const presence = "presence" in data ? (data as { presence?: { status?: unknown; lastSeenAt?: unknown } | null }).presence : undefined;
    if (locked) {
      this.hiddenPresence.add(userId);
      delete this.presenceByUser[userId];
      if (this.typing?.userId === userId) this.typing = null;
      this.searchResults = this.searchResults.filter((user) => user.id !== userId);
      this.friends = this.friends.filter((user) => user.id !== userId);
    } else {
      this.hiddenPresence.delete(userId);
      if (presence && (presence.status === "ONLINE" || presence.status === "OFFLINE")) {
        this.presenceByUser[userId] = {
          status: presence.status,
          lastSeenAt: typeof presence.lastSeenAt === "string" ? presence.lastSeenAt : null,
        };
      }
      this.conversations = await this.auth.listConversations();
    }
    if (this.blockEpoch.get(userId) !== epoch) return;
    if (status.blockedByMe) this.blockedUsers = await this.auth.blockedUsers();
    else this.blockedUsers = this.blockedUsers.filter((user) => user.id !== userId);
    if (this.peerId() === userId) {
      this.messageLock = status.blockedByMe ? "blocked-by-me" : status.blockedMe ? "blocked-me" : "none";
      if (this.messageLock === "none") this.error = null;
    }
    this.pushState();
  }

  private absorbPresence(people: readonly { id: string; presence?: { status: "ONLINE" | "OFFLINE"; lastSeenAt?: string | null } | null }[]): void {
    for (const person of people) {
      if (!person?.id || this.hiddenPresence.has(person.id)) continue;
      const next = mergePresence(this.presenceByUser[person.id], person.presence ?? null, "snapshot");
      if (next) this.presenceByUser[person.id] = next;
      else delete this.presenceByUser[person.id];
    }
  }

  private rememberPreview(conversationId: string, text: string | undefined): void {
    const preview = text?.trim();
    if (preview) this.conversationPreviews[conversationId] = preview;
  }

  private decorateMessages<T extends { attachments?: readonly { id: string; preview?: string; loadError?: boolean }[] }>(messages: readonly T[]): T[] {
    return messages.map((message) => {
      if (!message.attachments?.length) return message;
      return {
        ...message,
        attachments: message.attachments.map((file) => ({
          ...file,
          preview: file.preview || this.imagePreviews.get(file.id),
          loadError: this.imageErrors.has(file.id) || undefined,
          loadDetail: this.imageErrorText.get(file.id),
        })),
      };
    });
  }

  private imageFailureText(error: unknown): string {
    if (error instanceof Error && error.message === "This file could not be opened.") return "Couldn't open this image.";
    if (error instanceof ApiError) {
      if (error.status === 404) return "This image is no longer available.";
      if (error.status === 401 || error.status === 403) return "You don't have access to this image.";
      if (error.kind === "timeout") return "The image took too long to load.";
      if (error.kind === "network") return "Couldn't reach DevConnect to load this image.";
      if (error.status !== undefined && error.status >= 500) return "Couldn't load this image. Try again.";
    }
    return "Couldn't load this image.";
  }

  private rememberImage(id: string, dataUrl: string): void {
    this.imagePreviews.delete(id);
    this.imagePreviews.set(id, dataUrl);
    while (this.imagePreviews.size > 32) {
      const oldest = this.imagePreviews.keys().next().value;
      if (oldest === undefined) break;
      this.imagePreviews.delete(oldest);
    }
  }

  private scheduleImages(): void {
    const pending = this.messages.flatMap((message) => message.attachments ?? [])
      .filter((file) => file.mime.startsWith("image/") && file.key && !file.preview && !this.imagePreviews.has(file.id) && !this.imageErrors.has(file.id) && !this.imageFlight.has(file.id) && file.size <= 8_000_000)
      .slice(0, 2);
    for (const file of pending) {
      const epoch = (this.imageEpoch.get(file.id) ?? 0) + 1;
      this.imageEpoch.set(file.id, epoch);
      this.imageFlight.set(file.id, epoch);
      void this.loadImage(file.id, file.key, file.iv, file.mime, epoch);
    }
  }

  private loadImage(id: string, key: string, iv: string, mime: string, epoch: number): Promise<void> {
    const attempt = (retry: boolean): Promise<void> => this.auth.downloadAttachment(id, key, iv).then((bytes) => {
      if (this.imageEpoch.get(id) !== epoch) return;
      const type = mime.startsWith("image/") ? mime.split(";")[0] : "image/jpeg";
      this.rememberImage(id, `data:${type};base64,${Buffer.from(bytes).toString("base64")}`);
      this.imageErrors.delete(id);
      this.imageErrorText.delete(id);
    }).catch((error: unknown) => {
      if (this.imageEpoch.get(id) !== epoch) return;
      const transient = error instanceof ApiError && (error.kind === "network" || error.kind === "timeout" || (error.status !== undefined && error.status >= 500));
      if (transient && retry) return attempt(false);
      this.imageErrors.add(id);
      this.imageErrorText.set(id, this.imageFailureText(error));
      return undefined;
    });
    return attempt(true).finally(() => {
      if (this.imageFlight.get(id) === epoch) this.imageFlight.delete(id);
      if (this.imageEpoch.get(id) === epoch) this.pushState();
    });
  }

  hidesUser(userId: string): boolean {
    return this.hiddenPresence.has(userId) || this.blockedUsers.some((user) => user.id === userId);
  }

  private scheduleConversationRead(conversationId: string): void {
    if (this.readInflight.has(conversationId)) {
      this.readAgain.add(conversationId);
      return;
    }
    this.readInflight.add(conversationId);
    void this.auth.markConversationRead(conversationId).catch(() => undefined).finally(() => {
      this.readInflight.delete(conversationId);
      if (!this.readAgain.delete(conversationId)) return;
      this.scheduleConversationRead(conversationId);
    });
  }

  private peerId(participantIds?: readonly string[]): string | undefined {
    const ids = participantIds
      ?? this.conversations.find((conversation) => conversation.id === this.activeConversationId)?.participantIds;
    const selfId = this.auth.getUser()?.id;
    return ids?.find((id) => id !== selfId);
  }

  private async syncMessageLock(participantIds?: readonly string[]): Promise<HostState["messageLock"]> {
    const otherId = this.peerId(participantIds);
    if (!otherId) {
      this.messageLock = "none";
      return this.messageLock;
    }
    if (this.blockedUsers.some((user) => user.id === otherId)) {
      this.messageLock = "blocked-by-me";
      return this.messageLock;
    }
    try {
      const status = await this.auth.blockStatus(otherId);
      this.messageLock = status.blockedByMe ? "blocked-by-me" : status.blockedMe ? "blocked-me" : "none";
    } catch {
      // A failed status check must not clear a block that is already on screen.
    }
    return this.messageLock;
  }

  private async warmAvatars(): Promise<void> {
    const urls = [
      this.auth.getUser()?.profileImageUrl,
      this.selectedUser?.profileImageUrl,
      ...this.searchResults.map((user) => user.profileImageUrl),
      ...this.friends.map((user) => user.profileImageUrl),
      ...this.blockedUsers.map((user) => user.profileImageUrl),
      ...this.incomingRequests.map((request) => request.counterpart.profileImageUrl),
      ...this.outgoingRequests.map((request) => request.counterpart.profileImageUrl),
      ...this.conversations.map((conversation) => conversation.peerProfileImageUrl),
    ];
    for (const url of urls) {
      const id = url?.split("/").filter(Boolean).pop();
      if (!id || id.includes("..") || this.avatars[id] || this.avatarMisses.has(id)) continue;
      try {
        const data = await this.auth.avatarDataUrl(id);
        if (data) this.avatars = { ...this.avatars, [id]: data };
        else if (data === undefined) this.avatarMisses.add(id);
      } catch {
        // A network failure should not hide the picture on the next refresh.
      }
    }
  }

  private async refreshSocialQuiet(): Promise<void> {
    try {
      const social = await this.auth.loadSocial();
      this.friends = social.friends;
      this.incomingRequests = social.incoming;
      this.outgoingRequests = social.outgoing;
      this.pushState();
    } catch (error) {
      if (isAuthenticationFailure(error) || !this.auth.isAuthenticated()) {
        await this.auth.invalidateSession();
        this.enterLogin();
      } else {
        this.error = "Couldn't refresh friends. Open Friends to try again.";
      }
      this.pushState();
    }
  }

  private async refreshConversationsQuiet(): Promise<void> {
    try {
      this.conversations = await this.auth.listConversations();
      this.pushState();
    } catch (error) {
      if (isAuthenticationFailure(error) || !this.auth.isAuthenticated()) {
        await this.auth.invalidateSession();
        this.enterLogin();
      } else {
        this.error = "Couldn't refresh messages. Open Messages to try again.";
      }
      this.pushState();
    }
  }

  private async reconcileQuiet(): Promise<void> {
    await Promise.all([this.refreshSocialQuiet(), this.refreshConversationsQuiet(), this.refreshNotesQuiet()]);
    if (this.activeConversationId) await this.syncMessageLock();
  }

  private async refreshNotesQuiet(): Promise<void> {
    try {
      await this.fetchNotifications();
      this.pushState();
    } catch (error) {
      if (isAuthenticationFailure(error) || !this.auth.isAuthenticated()) {
        await this.auth.invalidateSession();
        this.enterLogin();
      }
      this.pushState();
    }
  }

  private async refreshSocialAndUser(userId?: string): Promise<void> {
    const social = await this.auth.loadSocial();
    this.friends = social.friends;
    this.incomingRequests = social.incoming;
    this.outgoingRequests = social.outgoing;
    if (userId && this.selectedUser?.id === userId) {
      try {
        this.selectedUser = await this.auth.getUserById(userId);
      } catch {
        this.selectedUser = null;
      }
    }
  }
}

