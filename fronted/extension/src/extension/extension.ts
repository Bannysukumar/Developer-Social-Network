import * as vscode from "vscode";
import { createApiConfig } from "../api/config";
import type { ScreenId } from "../shared/flow";
import { AuthService } from "./auth-service";
import { chatSocketUrl, messageFromFrame, NodeChatSocket, notificationFromFrame } from "./chat-socket";
import { decideMessageNotice, decideNotificationNotice, type NoticePrefs } from "./desktop-notice";
import { SessionFlow } from "./session-flow";
import { createStateMessage, renderWebview } from "./webview";

class DevConnectHost implements vscode.WebviewViewProvider, vscode.Disposable {
  private readonly flow: SessionFlow;
  private readonly chat = new NodeChatSocket();
  private readonly seenNotices = new Set<string>();
  private view: vscode.WebviewView | undefined;
  private started = false;
  private socketToken: string | undefined;
  private pending: { screen: ScreenId; conversationId?: string } | undefined;
  private readonly statusBar: vscode.StatusBarItem;

  constructor(private readonly auth: AuthService) {
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
    await this.flow.bootstrap();
    this.renderStatus();
    await this.consumePending();
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [] };
    view.webview.html = renderWebview(view.webview, this.flow.snapshot());
    view.webview.onDidReceiveMessage((rawMessage: unknown) => {
      void this.flow.handleMessage(rawMessage);
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
    this.socketToken = undefined;
    void this.syncChat();
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
      return;
    }
    if (token === this.socketToken) return;
    this.socketToken = token;
    this.chat.connect(chatSocketUrl(this.auth.apiConfig.baseUrl), token, {
      onFrame: (frame) => {
        const before = this.flow.snapshot();
        this.flow.ingestFrame(frame);
        void this.showDesktopNotice(frame, before.screen === "messages" ? before.activeConversationId : null);
      },
      onStatus: (status, recovered) => this.flow.setConnection(status, recovered),
    }, () => this.auth.ensureFreshAccessToken());
  }

  private async showDesktopNotice(frame: Parameters<typeof messageFromFrame>[0], openConversationId: string | null): Promise<void> {
    const prefs = readNoticePrefs();
    const viewing = this.view?.visible === true;
    const message = messageFromFrame(frame);
    const selfId = this.auth.getUser()?.id;
    const target = message
      ? decideMessageNotice(
        message.id,
        message.conversationId,
        message.senderId === selfId,
        viewing && openConversationId === message.conversationId,
        prefs,
        this.seenNotices,
      )
      : (() => {
        const note = notificationFromFrame(frame);
        return note ? decideNotificationNotice(note, prefs, this.seenNotices) : null;
      })();
    if (!target) return;
    this.rememberNotice(target.id);
    const choice = await vscode.window.showInformationMessage(target.body, target.action);
    if (choice !== target.action) return;
    this.pending = { screen: target.screen, conversationId: target.conversationId };
    await vscode.commands.executeCommand("workbench.view.extension.devconnect");
    await this.consumePending();
  }

  private rememberNotice(id: string): void {
    this.seenNotices.add(id);
    if (this.seenNotices.size > 200) {
      const oldest = this.seenNotices.values().next().value;
      if (oldest) this.seenNotices.delete(oldest);
    }
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

  const host = new DevConnectHost(auth);
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
