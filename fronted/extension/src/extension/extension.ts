import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import * as vscode from "vscode";
import { createApiConfig } from "../api/config";
import type { ScreenId } from "../shared/flow";
import { AuthService } from "./auth-service";
import { chatSocketUrl, messageFromFrame, NodeChatSocket, notificationFromFrame } from "./chat-socket";
import { decideNotificationNotice, decideStoredNotice, isActivelyReading, noticeChannel, noticeLaunchUri, resolveMessageNotice, unreadMessageNotificationId, windowInForeground, type NoticePrefs, type NoticeTarget, type ReadingContext } from "./desktop-notice";
import { showBackgroundNotice } from "./os-notice";
import { SessionFlow } from "./session-flow";
import { createStateMessage, renderWebview } from "./webview";

class DevConnectHost implements vscode.WebviewViewProvider, vscode.Disposable {
  private readonly flow: SessionFlow;
  private readonly chat = new NodeChatSocket();
  private readonly seenNotices = new Set<string>();
  private view: vscode.WebviewView | undefined;
  private started = false;
  private socketToken: string | undefined;
  private pending: { screen: ScreenId; conversationId?: string; userId?: string; notificationId?: string; friendsPanel?: "requests" } | undefined;
  private readonly openNotices: { conversationId?: string; notificationId?: string }[] = [];
  private openingNotice = false;
  private reportedConversationId: string | null = null;
  private webviewDocumentVisible = false;
  private webviewFocused = false;
  private readonly statusBar: vscode.StatusBarItem;

  constructor(
    private readonly auth: AuthService,
    private readonly noticeDir: string | undefined,
    private readonly toastScript: string,
    private readonly output: vscode.OutputChannel,
  ) {
    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
    this.statusBar.command = "devconnect.open";
    this.flow = new SessionFlow(auth, () => {
      if (!this.flow.snapshot().authenticated) this.clearViewing();
      this.pushState();
      this.renderStatus();
      void this.syncChat();
    }, async (name, bytes) => {
      const base = vscode.workspace.workspaceFolders?.[0]?.uri
        ?? vscode.Uri.file(process.env.USERPROFILE || process.env.HOME || ".");
      const target = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.joinPath(base, name), saveLabel: "Save file" });
      if (target) await vscode.workspace.fs.writeFile(target, bytes);
    });
  }

  dispose(): void {
    this.chat.close();
    this.statusBar.dispose();
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.flow.setNotices(readNoticePrefs());
    await this.flow.bootstrap();
    this.renderStatus();
    await this.consumePending();
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    this.clearViewing();
    view.webview.options = { enableScripts: true, localResourceRoots: [] };
    view.webview.html = renderWebview(view.webview, this.flow.snapshot());
    this.seedViewingFromSnapshot();
    view.webview.onDidReceiveMessage((rawMessage: unknown) => {
      if (this.view !== view) return;
      void this.onWebviewMessage(rawMessage);
    });
    view.onDidChangeVisibility(() => {
      if (this.view !== view) return;
      if (!view.visible) {
        this.webviewDocumentVisible = false;
        this.webviewFocused = false;
        return;
      }
      const snap = this.flow.snapshot();
      if (this.reportedConversationId && snap.screen === "messages" && snap.activeConversationId === this.reportedConversationId) {
        this.webviewDocumentVisible = true;
      }
    });
    view.onDidDispose(() => {
      if (this.view === view) {
        this.view = undefined;
        this.clearViewing();
      }
    });
    if (!this.started) {
      void this.start();
    } else {
      this.pushState();
      void this.consumePending();
    }
  }

  reloadConfig(): void {
    this.flow.reloadConfig(readApiConfigFromWorkspace());
    this.flow.setNotices(readNoticePrefs());
    this.socketToken = undefined;
    void this.syncChat();
  }

  openFromNotice(uri: vscode.Uri): void {
    if (uri.path !== "/notice") return;
    const params = new URLSearchParams(uri.query);
    const screen = params.get("screen");
    if (screen !== "messages" && screen !== "friends" && screen !== "user" && screen !== "notifications") return;
    if (this.openingNotice) return;
    this.openingNotice = true;
    this.pending = {
      screen,
      conversationId: params.get("conversationId") ?? undefined,
      notificationId: params.get("notificationId") ?? undefined,
      userId: params.get("userId") ?? undefined,
      friendsPanel: params.get("friendsPanel") === "requests" ? "requests" : undefined,
    };
    this.output.appendLine(`notice click screen=${screen}`);
    void Promise.resolve(vscode.commands.executeCommand("workbench.view.extension.devconnect"))
      .then(() => this.consumePending())
      .finally(() => {
        this.openingNotice = false;
      });
  }

  async open(target?: { screen: ScreenId; conversationId?: string }): Promise<void> {
    if (target) this.pending = target;
    await vscode.commands.executeCommand("workbench.view.extension.devconnect");
    await this.consumePending();
  }

  async markAllRead(): Promise<void> {
    await this.flow.handleMessage({ version: 1, type: "markAllNotificationsRead" });
  }

  private pushState(): void {
    if (!this.view) return;
    void this.view.webview.postMessage(createStateMessage(this.flow.snapshot()));
  }

  private renderStatus(): void {
    const state = this.flow.snapshot();
    if (!state.authenticated) {
      this.statusBar.hide();
      return;
    }
    const unread = state.unreadMessages + state.unreadNotifications + state.incomingRequests.length;
    this.statusBar.text = unread > 0 ? `DevConnect (${unread})` : "DevConnect";
    this.statusBar.tooltip = state.connection === "reconnecting" ? "DevConnect is reconnecting" : "Open DevConnect";
    this.statusBar.show();
  }

  private async syncChat(): Promise<void> {
    const state = this.flow.snapshot();
    if (!state.authenticated || state.phase !== "ready") {
      this.socketToken = undefined;
      this.chat.close();
      return;
    }
    const token = await this.auth.ensureFreshAccessToken();
    if (!token) {
      this.chat.close();
      this.socketToken = undefined;
      if (!this.auth.isAuthenticated()) this.flow.sessionExpired();
      return;
    }
    if (token === this.socketToken) return;
    this.socketToken = token;
    this.chat.connect(chatSocketUrl(this.auth.apiConfig.baseUrl), token, {
      onFrame: (frame) => {
        const conversations = this.flow.snapshot().conversations;
        this.flow.ingestFrame(frame);
        this.attachMessageNotification(frame);
        void this.showDesktopNotice(frame, conversations);
      },
      onStatus: (status, recovered) => {
        this.flow.setConnection(status, recovered);
        if (status === "connected" && recovered) void this.recoverMissedNotices();
      },
      onAuthLost: () => {
        this.socketToken = undefined;
        this.flow.sessionExpired();
      },
    }, () => this.auth.ensureFreshAccessToken(), () => this.auth.renewAccessToken());
  }

  private async showDesktopNotice(
    frame: Parameters<typeof messageFromFrame>[0],
    conversations: readonly { id: string; peerDisplayName?: string; peerUsername?: string }[],
  ): Promise<void> {
    const prefs = readNoticePrefs();
    const message = messageFromFrame(frame);
    const selfId = this.auth.getUser()?.id;
    if (message?.deletedForEveryone || frame.type === "MESSAGE_DELETED" || frame.type === "MESSAGE_HIDDEN") return;
    if (message && message.senderId !== selfId && this.flow.hidesUser(message.senderId)) return;
    const noticeSlot = message ? { conversationId: message.conversationId, notificationId: unreadMessageNotificationId(this.flow.snapshot().notifications, message.conversationId) } : undefined;
    if (noticeSlot) this.openNotices.push(noticeSlot);
    const reading = this.readingContext();
    const decision = message
      ? resolveMessageNotice({
        messageId: message.id,
        conversationId: message.conversationId,
        senderIsSelf: message.senderId === selfId,
        senderBlocked: false,
        reading,
        prefs,
        seen: this.seenNotices,
        senderLabel: conversations.find((item) => item.id === message.conversationId)?.peerDisplayName
          || conversations.find((item) => item.id === message.conversationId)?.peerUsername
          || "Someone",
        notificationId: noticeSlot?.notificationId,
      })
      : null;
    const target = message
      ? decision?.target ?? null
      : (() => {
        const note = notificationFromFrame(frame);
        return note ? decideNotificationNotice(note, prefs, this.seenNotices) : null;
      })();
    if (!target) {
      for (const id of decision?.rememberIds ?? []) this.rememberNotice(id);
      this.output.appendLine(`notice suppressed id=${message?.id ?? "notification"} focused=${vscode.window.state.focused} active=${this.windowIsForeground()} viewVisible=${this.view?.visible === true}`);
      this.dropNotice(noticeSlot);
      return;
    }
    for (const id of decision?.rememberIds ?? []) {
      if (!this.rememberNotice(id)) {
        this.dropNotice(noticeSlot);
        return;
      }
    }
    await this.presentNotice(target);
    this.dropNotice(noticeSlot);
  }

  private readingContext(): ReadingContext {
    const state = vscode.window.state as { focused: boolean; active?: boolean };
    const snap = this.flow.snapshot();
    return {
      windowFocused: state.focused,
      windowActive: state.active,
      viewVisible: this.view?.visible === true,
      screen: snap.screen,
      activeConversationId: snap.screen === "messages" ? snap.activeConversationId : null,
      reportedConversationId: this.reportedConversationId,
      webviewDocumentVisible: this.webviewDocumentVisible,
      webviewFocused: this.webviewFocused,
    };
  }

  private clearViewing(): void {
    this.reportedConversationId = null;
    this.webviewDocumentVisible = false;
    this.webviewFocused = false;
  }

  /** The HTML just rendered already shows this thread, before the webview script reports back. */
  private seedViewingFromSnapshot(): void {
    if (this.view?.visible !== true) return;
    const snap = this.flow.snapshot();
    if (!snap.authenticated || snap.screen !== "messages" || !snap.activeConversationId) return;
    this.reportedConversationId = snap.activeConversationId;
    this.webviewDocumentVisible = true;
  }

  private windowIsForeground(): boolean {
    const state = vscode.window.state as { focused: boolean; active?: boolean };
    return windowInForeground(state.focused, state.active, this.webviewFocused);
  }

  private async presentNotice(target: NoticeTarget): Promise<void> {
    if (!this.rememberNotice(target.id)) {
      this.output.appendLine(`notice duplicate id=${target.id}`);
      return;
    }
    const foreground = this.windowIsForeground();
    this.output.appendLine(`notice show id=${target.id} action=${target.action} foreground=${foreground} viewVisible=${this.view?.visible === true}`);
    if (noticeChannel(foreground) === "desktop") {
      const launch = noticeLaunchUri("Bannysukumar2255", "devconnect-vscode-extension", target);
      const toast = await showBackgroundNotice(this.toastScript, target.body, launch);
      this.output.appendLine(`windows toast ok=${toast.ok} detail=${toast.detail}`);
      return;
    }
    const choice = await vscode.window.showInformationMessage(target.body, target.action);
    if (choice !== target.action || this.openingNotice) return;
    this.openingNotice = true;
    this.pending = {
      screen: target.screen,
      conversationId: target.conversationId,
      notificationId: target.notificationId,
      userId: target.userId,
      friendsPanel: target.friendsPanel,
    };
    try {
      await vscode.commands.executeCommand("workbench.view.extension.devconnect");
      await this.consumePending();
    } finally {
      this.openingNotice = false;
    }
  }

  private dropNotice(slot: { conversationId?: string; notificationId?: string } | undefined): void {
    if (!slot) return;
    const index = this.openNotices.indexOf(slot);
    if (index >= 0) this.openNotices.splice(index, 1);
  }

  private attachMessageNotification(frame: Parameters<typeof notificationFromFrame>[0]): void {
    const note = notificationFromFrame(frame);
    if (!note || note.read || note.type !== "NEW_MESSAGE" || !note.referenceId) return;
    for (const slot of this.openNotices) {
      if (slot.conversationId === note.referenceId && !slot.notificationId) {
        slot.notificationId = note.id;
        this.rememberNotice(note.id);
      }
    }
  }

  private async recoverMissedNotices(): Promise<void> {
    try {
      const list = await this.auth.loadNotifications();
      const prefs = readNoticePrefs();
      for (const note of list.items) {
        const reading = note.referenceId ? isActivelyReading(this.readingContext(), note.referenceId) : false;
        const target = decideStoredNotice(note, prefs, this.seenNotices, reading);
        if (!target && reading && note.type === "NEW_MESSAGE") this.rememberNotice(note.id);
        if (target) await this.presentNotice(target);
      }
    } catch {
      // A failed list does not end the session. The socket remains the live source.
    }
  }

  private rememberNotice(id: string): boolean {
    const safeId = id.replace(/[^A-Za-z0-9_-]/g, "");
    if (!safeId || this.seenNotices.has(safeId)) return false;
    if (this.noticeDir) {
      try {
        mkdirSync(this.noticeDir, { recursive: true });
        writeFileSync(join(this.noticeDir, safeId), "1", { flag: "wx" });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
      }
    }
    this.seenNotices.add(safeId);
    if (this.seenNotices.size > 200) {
      const oldest = this.seenNotices.values().next().value;
      if (oldest) this.seenNotices.delete(oldest);
    }
    return true;
  }

  private async onWebviewMessage(rawMessage: unknown): Promise<void> {
    if (rawMessage && typeof rawMessage === "object" && "type" in rawMessage && rawMessage.type === "viewingConversation") {
      const message = rawMessage as { conversationId?: unknown; documentVisible?: unknown; webviewFocused?: unknown };
      if (typeof message.documentVisible !== "boolean") return;
      if (message.conversationId !== null && (typeof message.conversationId !== "string" || message.conversationId.length < 1)) return;
      const webviewFocused = typeof message.webviewFocused === "boolean" ? message.webviewFocused : false;
      this.reportedConversationId = message.conversationId;
      this.webviewDocumentVisible = message.documentVisible;
      this.webviewFocused = message.documentVisible && webviewFocused;
      return;
    }
    if (rawMessage && typeof rawMessage === "object" && "type" in rawMessage && rawMessage.type === "typing") {
      const message = rawMessage as { conversationId?: string; active?: boolean };
      if (typeof message.conversationId === "string" && typeof message.active === "boolean") {
        this.chat.send({ type: message.active ? "TYPING_START" : "TYPING_STOP", conversationId: message.conversationId });
      }
      return;
    }
    if (rawMessage && typeof rawMessage === "object" && "type" in rawMessage && rawMessage.type === "setNotify") {
      const message = rawMessage as { key?: string; enabled?: boolean };
      const setting = message.key === "messages"
        ? "notifyMessages"
        : message.key === "friendRequests"
          ? "notifyFriendRequests"
          : message.key === "friendAccepted"
            ? "notifyFriendAccepted"
            : "";
      if (setting && typeof message.enabled === "boolean") {
        await vscode.workspace.getConfiguration("devconnect").update(setting, message.enabled, vscode.ConfigurationTarget.Global);
      }
      return;
    }
    await this.flow.handleMessage(rawMessage);
  }

  private async consumePending(): Promise<void> {
    const pending = this.pending;
    if (!pending || !this.view || this.flow.snapshot().phase === "checking") return;
    this.pending = undefined;
    await this.flow.focusTarget(pending);
  }
}

export function readApiConfigFromWorkspace() {
  const settings = vscode.workspace.getConfiguration("devconnect");
  return createApiConfig({
    baseUrl: settings.get<string>("apiBaseUrl") ?? "https://devconnectt.duckdns.org/api/v1",
    timeoutMs: settings.get<number>("requestTimeoutMs") ?? 15_000,
    allowInsecureHttp: settings.get<boolean>("allowInsecureHttp") ?? false,
  });
}

function readNoticePrefs(): NoticePrefs {
  const settings = vscode.workspace.getConfiguration("devconnect");
  return {
    messages: settings.get<boolean>("notifyMessages") ?? true,
    friendRequests: settings.get<boolean>("notifyFriendRequests") ?? true,
    friendAccepted: settings.get<boolean>("notifyFriendAccepted") ?? true,
  };
}

export function activate(context: vscode.ExtensionContext): void {
  let auth: AuthService;
  try {
    auth = new AuthService(context, readApiConfigFromWorkspace());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid DevConnect API configuration.";
    void vscode.window.showErrorMessage(message);
    auth = new AuthService(context, {
      baseUrl: "https://localhost/api/v1",
      timeoutMs: 15_000,
      allowInsecureHttp: false,
    });
  }

  const output = vscode.window.createOutputChannel("DevConnect");
  const host = new DevConnectHost(auth, join(context.globalStorageUri.fsPath, "notices"), join(context.extensionUri.fsPath, "windows-toast.ps1"), output);
  context.subscriptions.push(output, vscode.window.registerUriHandler({
    handleUri(uri) {
      host.openFromNotice(uri);
    },
  }));
  const open = (screen: ScreenId) => () => host.open({ screen });
  context.subscriptions.push(
    host,
    vscode.window.registerWebviewViewProvider("devconnect.home", host),
    vscode.commands.registerCommand("devconnect.open", () => host.open()),
    vscode.commands.registerCommand("devconnect.openMessages", open("messages")),
    vscode.commands.registerCommand("devconnect.openNotifications", open("notifications")),
    vscode.commands.registerCommand("devconnect.openFriends", open("friends")),
    vscode.commands.registerCommand("devconnect.openProfile", open("profile")),
    vscode.commands.registerCommand("devconnect.openSettings", open("settings")),
    vscode.commands.registerCommand("devconnect.markNotificationsRead", () => host.markAllRead()),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("devconnect")) host.reloadConfig();
    }),
  );
  void host.start();
}

export function deactivate(): void {}
