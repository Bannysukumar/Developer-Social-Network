import type { ApiConfig } from "../api/config";
import { notificationDestination, resolveScreen, type ScreenId } from "../shared/flow";
import { webviewMessageSchema } from "../shared/protocol";
import type { AuthService } from "./auth-service";
import { messageFromFrame, notificationFromFrame, type ServerFrame, type SocketStatus } from "./chat-socket";
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
  constructor(
    private readonly auth: AuthService,
    private readonly onChange: () => void,
  ) {}

  reloadConfig(config: ApiConfig): void {
    try {
      this.auth.reloadConfig(config);
      this.notice = "API settings updated.";
      this.error = null;
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
      canGoBack: this.history.length > 0 && this.phase === "ready",
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
    };
  }

  private pushState(): void {
    this.onChange();
  }

  setConnection(status: SocketStatus, recovered: boolean): void {
    const previous = this.connection;
    this.connection = status;
    if (status === "connected" && recovered && previous !== "connected") {
      this.toast = "Connection restored";
      this.toastSeq += 1;
      void this.reconcileQuiet();
    }
    this.pushState();
  }

  ingestFrame(frame: ServerFrame): void {
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
    if (recordHistory && this.phase === "ready" && next !== this.screen && this.screen !== "splash") {
      this.history.push(this.screen);
    }
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
    this.seenMessageIds.clear();
    this.toast = null;
    this.devices = [];
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
    this.conversations = conversations;
    this.notifications = notes.items;
    this.unreadNotifications = notes.unreadCount;
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
    if (message.type === "navigate") {
      this.error = null;
      this.show(message.destination, true);
      this.pushState();
      if (this.auth.isAuthenticated()) await this.refreshFor(this.screen);
      return;
    }

    await this.run(message);
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
        case "updateProfile":
          await this.auth.updateProfile({
            displayName: message.displayName,
            bio: message.bio,
            accountType: message.accountType,
          });
          this.notice = "Profile saved.";
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
          await this.refreshSocialAndUser(message.userId);
          break;
        case "unblockUser":
          await this.auth.unblockUser(message.userId);
          this.notice = "User unblocked.";
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
          for (const item of opened.messages) this.seenMessageIds.add(item.id);
          delete this.unreadByConversation[opened.conversation.id];
          this.unreadMessages = Object.values(this.unreadByConversation).reduce((sum, count) => sum + count, 0);
          this.conversations = await this.auth.listConversations();
          this.show("messages", this.screen !== "messages");
          break;
        }
        case "sendMessage": {
          const sent = await this.auth.sendMessage(message.conversationId, message.text);
          this.messages = [sent, ...this.messages];
          this.activeConversationId = message.conversationId;
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
            this.show("messages", true);
          } else if (note) {
            this.show(notificationDestination(note.type), true);
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
      this.pushState();
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

