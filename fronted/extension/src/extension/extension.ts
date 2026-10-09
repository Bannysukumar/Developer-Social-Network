import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import * as vscode from "vscode";
import { createApiConfig } from "../api/config";
import type { ScreenId } from "../shared/flow";
import { AuthService } from "./auth-service";
import { chatSocketUrl, messageFromFrame, NodeChatSocket, notificationFromFrame } from "./chat-socket";
import { decideMessageNotice, decideNotificationNotice, decideStoredNotice, isActivelyReading, noticeLaunchUri, unreadMessageNotificationId, type NoticePrefs, type NoticeTarget } from "./desktop-notice";
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
      this.pushState();
      this.renderStatus();
      void this.syncChat();
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
    view.webview.options = { enableScripts: true, localResourceRoots: [] };
    view.webview.html = renderWebview(view.webview, this.flow.snapshot());
    view.webview.onDidReceiveMessage((rawMessage: unknown) => {
      void this.onWebviewMessage(rawMessage);
    });
    view.onDidDispose(() => {
      if (this.view === view) this.view = undefined;
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
        const before = this.flow.snapshot();
        this.flow.ingestFrame(frame);
        this.attachMessageNotification(frame);
        void this.showDesktopNotice(
          frame,
          before.screen === "messages" ? before.activeConversationId : null,
          before.conversations,
        );
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
    openConversationId: string | null,
    conversations: readonly { id: string; peerDisplayName?: string; peerUsername?: string }[],
  ): Promise<void> {
    const prefs = readNoticePrefs();
    const message = messageFromFrame(frame);
    const selfId = this.auth.getUser()?.id;
    const noticeSlot = message ? { conversationId: message.conversationId, notificationId: unreadMessageNotificationId(this.flow.snapshot().notifications, message.conversationId) } : undefined;
    if (noticeSlot) this.openNotices.push(noticeSlot);
    const target = message
      ? decideMessageNotice(
        message.id,
        message.conversationId,
        message.senderId === selfId,
        isActivelyReading(this.windowIsForeground(), this.view?.visible === true, openConversationId, message.conversationId),
        prefs,
        this.seenNotices,
        conversations.find((item) => item.id === message.conversationId)?.peerDisplayName
          || conversations.find((item) => item.id === message.conversationId)?.peerUsername
          || "Someone",
        noticeSlot?.notificationId,
      )
      : (() => {
        const note = notificationFromFrame(frame);
        return note ? decideNotificationNotice(note, prefs, this.seenNotices) : null;
      })();
    if (!target) {
      this.output.appendLine(`notice suppressed id=${message?.id ?? "notification"} focused=${vscode.window.state.focused}`);
      this.dropNotice(noticeSlot);
      return;
    }
    if (noticeSlot?.notificationId && !this.rememberNotice(noticeSlot.notificationId)) {
      this.dropNotice(noticeSlot);
      return;
    }
    await this.presentNotice(target);
    this.dropNotice(noticeSlot);
  }

  private windowIsForeground(): boolean {
    const state = vscode.window.state as { focused: boolean; active?: boolean };
    return state.focused && state.active !== false;
  }

  private async presentNotice(target: NoticeTarget): Promise<void> {
    if (!this.rememberNotice(target.id)) {
      this.output.appendLine(`notice duplicate id=${target.id}`);
      return;
    }
    const foreground = this.windowIsForeground();
    this.output.appendLine(`notice show id=${target.id} action=${target.action} foreground=${foreground} viewVisible=${this.view?.visible === true}`);
    if (!foreground) {
      const launch = noticeLaunchUri("Bannysukumar2255", "devconnect-vscode-extension", target);
      const toast = await showBackgroundNotice(this.toastScript, target.body, launch);
      this.output.appendLine(`windows toast ok=${toast.ok} detail=${toast.detail}`);
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
      const state = this.flow.snapshot();
      for (const note of list.items) {
        const reading = note.referenceId
          ? isActivelyReading(this.windowIsForeground(), this.view?.visible === true, state.screen === "messages" ? state.activeConversationId : null, note.referenceId)
          : false;
        const target = decideStoredNotice(note, prefs, this.seenNotices, reading);
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
