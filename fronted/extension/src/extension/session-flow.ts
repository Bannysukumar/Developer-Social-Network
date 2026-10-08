import type { ApiConfig } from "../api/config";
import { notificationDestination, resolveScreen, type ScreenId } from "../shared/flow";
import { webviewMessageSchema } from "../shared/protocol";
import type { AuthService } from "./auth-service";
import { messageFromFrame, notificationFromFrame, presenceFromFrame, typingFromFrame, type ServerFrame, type SocketStatus } from "./chat-socket";
import { mergeLiveMessage, mergeNotification, mergeReceipt } from "./realtime-state";
import { emptyHostState, type HostState } from "./webview";

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
  constructor(
    private readonly auth: AuthService,
    private readonly onChange: () => void,
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
      messages: this.messages,
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
    };
  }

  setNotices(prefs: { messages: boolean; friendRequests: boolean; friendAccepted: boolean }): void {
    this.notifyMessages = prefs.messages;
    this.notifyFriendRequests = prefs.friendRequests;
    this.notifyFriendAccepted = prefs.friendAccepted;
    this.pushState();
  }

  private pushState(): void {
    this.onChange();
  }

  setConnection(status: SocketStatus, recovered: boolean): void {
    const previous = this.connection;
    if (previous === status && !recovered) return;
    this.connection = status;
    if (status === "connected" && recovered && previous !== "connected") {
      this.toast = "Connection restored";
      this.toastSeq += 1;
      void this.reconcileQuiet();
    }
    this.pushState();
  }

  ingestFrame(frame: ServerFrame): void {
    const presence = presenceFromFrame(frame);
    if (presence) {
      this.presenceByUser[presence.userId] = { status: presence.status, lastSeenAt: presence.lastSeenAt ?? null };
      this.pushState();
      return;
    }
    const typing = typingFromFrame(frame);
    if (typing) {
      if (this.typingTimer) clearTimeout(this.typingTimer);
      this.typingTimer = undefined;
      if (typing.active && typing.userId !== this.auth.getUser()?.id) {
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
    const message = messageFromFrame(frame);
    if (message) {
      if (this.seenMessageIds.has(message.id)) return;
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
    const patch = mergeNotification(this.notifications, note, this.unreadNotifications, this.toastSeq);
    if (patch.notifications) this.notifications = patch.notifications;
    if (patch.unreadNotifications !== undefined) this.unreadNotifications = patch.unreadNotifications;
    if (patch.toast) {
      this.toast = patch.toast;
      this.toastSeq = patch.toastSeq ?? this.toastSeq;
    }
    if (patch.refresh === "social") void this.refreshSocialQuiet();
    if (patch.refresh === "conversations") void this.refreshConversationsQuiet();
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
    this.notifications = [];
    this.unreadNotifications = 0;
    this.unreadMessages = 0;
    this.unreadByConversation = {};
    this.presenceByUser = {};
    this.typing = null;
    if (this.typingTimer) clearTimeout(this.typingTimer);
    this.typingTimer = undefined;
    this.seenMessageIds.clear();
    this.toast = null;
    this.devices = [];
    this.blockedUsers = [];
    this.avatars = {};
    this.avatarMisses.clear();
    this.messageLock = "none";
  }

  async bootstrap(): Promise<void> {
    this.phase = "checking";
    this.screen = "splash";
    this.pushState();
    try {
      if (this.auth.isAuthenticated()) {
        await this.auth.refreshProfile();
        this.phase = "ready";
        this.show("home", false);
        await this.loadShell();
      } else {
        this.phase = "ready";
        this.show("login", false);
      }
    } catch (error) {
      await this.auth.logout();
      this.clearPrivateState();
      this.phase = "ready";
      this.show("login", false);
      this.error = this.auth.userFacingError(error);
    }
    this.pushState();
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
    this.notifications = notes.items;
    this.unreadNotifications = notes.unreadCount;
    try {
      this.blockedUsers = await this.auth.blockedUsers();
    } catch {
      this.blockedUsers = [];
    }
    await this.auth.ensureDeviceKeys();
  }

  async handleMessage(rawMessage: unknown): Promise<void> {
    const result = webviewMessageSchema.safeParse(rawMessage);
    if (!result.success || this.phase === "checking") return;
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
      this.messageLock = "none";
      this.error = null;
      this.pushState();
      return;
    }
    if (message.type === "navigate") {
      this.error = null;
      if (message.destination === "messages" && this.screen === "messages") this.activeConversationId = null;
      this.show(message.destination, true);
      this.pushState();
      if (this.auth.isAuthenticated() && message.destination === "settings") {
        await this.run({ version: 1, type: "loadDevices" });
      }
      return;
    }
    if (message.type === "retry") {
      await this.refreshFor(this.screen);
      return;
    }

    await this.run(message);
  }

  async focusTarget(target: { screen: ScreenId; conversationId?: string; userId?: string; friendsPanel?: "requests" }): Promise<void> {
    if (!this.auth.isAuthenticated()) {
      this.phase = "ready";
      this.show("login", false);
      this.pushState();
      return;
    }
    if (this.phase === "checking") return;
    if (target.conversationId) {
      const opened = await this.auth.openConversation({ conversationId: target.conversationId });
      this.activeConversationId = opened.conversation.id;
      this.messages = opened.messages;
      this.rememberPreview(opened.conversation.id, opened.messages[0]?.displayText);
      for (const item of opened.messages) this.seenMessageIds.add(item.id);
      delete this.unreadByConversation[opened.conversation.id];
      this.unreadMessages = Object.values(this.unreadByConversation).reduce((sum, count) => sum + count, 0);
      this.conversations = await this.auth.listConversations();
      await this.syncMessageLock(opened.conversation.participantIds);
      this.show("messages", false);
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
          if (this.peerId() === message.userId) this.messageLock = "blocked-by-me";
          await this.refreshSocialAndUser(message.userId);
          break;
        case "unblockUser":
          await this.auth.unblockUser(message.userId);
          this.notice = "User unblocked.";
          this.blockedUsers = this.blockedUsers.filter((user) => user.id !== message.userId);
          if (this.peerId() === message.userId) await this.syncMessageLock();
          await this.refreshSocialAndUser(message.userId);
          break;
        case "loadConversations":
          this.conversations = await this.auth.listConversations();
          break;
        case "openConversation": {
          const opened = await this.auth.openConversation({
            conversationId: message.conversationId,
            participantId: message.participantId,
          });
          this.activeConversationId = opened.conversation.id;
          this.messages = opened.messages;
          this.rememberPreview(opened.conversation.id, opened.messages[0]?.displayText);
          for (const item of opened.messages) this.seenMessageIds.add(item.id);
          delete this.unreadByConversation[opened.conversation.id];
          this.unreadMessages = Object.values(this.unreadByConversation).reduce((sum, count) => sum + count, 0);
          this.conversations = await this.auth.listConversations();
          await this.syncMessageLock(opened.conversation.participantIds);
          this.show("messages", this.screen !== "messages");
          break;
        }
        case "sendMessage": {
          if (this.messageLock !== "none") {
            this.error = this.messageLock === "blocked-by-me"
              ? "You blocked this user."
              : "You can't message this user.";
            break;
          }
          const localId = `local-${Date.now()}`;
          this.messages = [{
            id: localId,
            conversationId: message.conversationId,
            senderId: this.auth.getUser()?.id ?? "me",
            recipientId: this.peerId() ?? "peer",
            ciphertext: "",
            messageType: "TEXT",
            status: "SENT",
            displayText: message.text,
            sendState: "sending",
          }, ...this.messages.filter((item) => !(item.id.startsWith("local-") && item.displayText === message.text))];
          this.pushState();
          try {
            const sent = await this.auth.sendMessage(message.conversationId, message.text);
            this.messages = [sent, ...this.messages.filter((item) => !(item.id.startsWith("local-") && item.displayText === message.text))];
            this.rememberPreview(message.conversationId, sent.displayText);
            this.activeConversationId = message.conversationId;
          } catch (error) {
            const text = this.auth.userFacingError(error);
            if (/encryption key|not registered/.test(text)) {
              this.messages = this.messages.filter((item) => item.id !== localId);
              this.error = text;
              break;
            }
            if (/can't interact|Only friends can exchange messages/.test(text)) {
              this.messages = this.messages.filter((item) => item.id !== localId);
              const lock = await this.syncMessageLock();
              this.error = lock === "blocked-me" ? "You can't message this user." : text;
              break;
            }
            this.messages = [{
              id: `local-${Date.now()}`,
              conversationId: message.conversationId,
              senderId: this.auth.getUser()?.id ?? "me",
              recipientId: this.peerId() ?? "peer",
              ciphertext: "",
              messageType: "TEXT",
              status: "SENT",
              displayText: message.text,
              sendState: "failed",
            }, ...this.messages.filter((item) => !(item.id.startsWith("local-") && item.displayText === message.text))];
          }
          break;
        }
        case "loadNotifications": {
          const notes = await this.auth.loadNotifications();
          this.notifications = notes.items;
          this.unreadNotifications = notes.unreadCount;
          break;
        }
        case "openNotification": {
          const note = this.notifications.find((item) => item.id === message.notificationId);
          if (note && !note.read) await this.auth.markNotificationRead(note.id);
          const notes = await this.auth.loadNotifications();
          this.notifications = notes.items;
          this.unreadNotifications = notes.unreadCount;
          if (note?.type === "NEW_MESSAGE" && note.referenceId) {
            const opened = await this.auth.openConversation({ conversationId: note.referenceId });
            this.activeConversationId = opened.conversation.id;
            this.messages = opened.messages;
            this.rememberPreview(opened.conversation.id, opened.messages[0]?.displayText);
            for (const item of opened.messages) this.seenMessageIds.add(item.id);
            delete this.unreadByConversation[opened.conversation.id];
            this.unreadMessages = Object.values(this.unreadByConversation).reduce((sum, count) => sum + count, 0);
            await this.syncMessageLock(opened.conversation.participantIds);
            this.show("messages", true);
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
          await this.auth.markNotificationRead(message.notificationId);
          const notes = await this.auth.loadNotifications();
          this.notifications = notes.items;
          this.unreadNotifications = notes.unreadCount;
          break;
        }
        case "markAllNotificationsRead": {
          await this.auth.markAllNotificationsRead();
          const notes = await this.auth.loadNotifications();
          this.notifications = notes.items;
          this.unreadNotifications = notes.unreadCount;
          this.notice = "Notifications marked read.";
          break;
        }
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
      this.error = this.auth.userFacingError(error);
    } finally {
      this.busy = false;
      if (this.auth.isAuthenticated()) await this.warmAvatars();
      this.pushState();
    }
  }

  private absorbPresence(people: readonly { id: string; presence?: { status: "ONLINE" | "OFFLINE"; lastSeenAt?: string | null } | null }[]): void {
    for (const person of people) {
      if (!person?.presence?.status) continue;
      this.presenceByUser[person.id] = { status: person.presence.status, lastSeenAt: person.presence.lastSeenAt ?? null };
    }
  }

  private rememberPreview(conversationId: string, text: string | undefined): void {
    const preview = text?.trim();
    if (preview) this.conversationPreviews[conversationId] = preview;
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
      this.messageLock = "none";
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
    ];
    for (const url of urls) {
      const id = url?.split("/").filter(Boolean).pop();
      if (!id || id.includes("..") || this.avatars[id] || this.avatarMisses.has(id)) continue;
      try {
        const data = await this.auth.avatarDataUrl(id);
        if (data) this.avatars = { ...this.avatars, [id]: data };
        else this.avatarMisses.add(id);
      } catch {
        this.avatarMisses.add(id);
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
    } catch {
      this.error = "Couldn't refresh friends. Open Friends to try again.";
      this.pushState();
    }
  }

  private async refreshConversationsQuiet(): Promise<void> {
    try {
      this.conversations = await this.auth.listConversations();
      this.pushState();
    } catch {
      this.error = "Couldn't refresh messages. Open Messages to try again.";
      this.pushState();
    }
  }

  private async reconcileQuiet(): Promise<void> {
    await Promise.all([this.refreshSocialQuiet(), this.refreshConversationsQuiet(), this.refreshNotesQuiet()]);
  }

  private async refreshNotesQuiet(): Promise<void> {
    try {
      const notes = await this.auth.loadNotifications();
      this.notifications = notes.items;
      this.unreadNotifications = notes.unreadCount;
      this.pushState();
    } catch {
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

