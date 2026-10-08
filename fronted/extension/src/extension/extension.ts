import * as vscode from "vscode";
import { createApiConfig } from "../api/config";
import { AuthService } from "./auth-service";
import { chatSocketUrl, messageFromFrame, NodeChatSocket } from "./chat-socket";
import { SessionFlow } from "./session-flow";
import { createStateMessage, renderWebview } from "./webview";

class DevConnectViewProvider implements vscode.WebviewViewProvider {
  private readonly flow: SessionFlow;
  private readonly chat = new NodeChatSocket();
  private view: vscode.WebviewView | undefined;
  private bootstrapped = false;
  private socketToken: string | undefined;

  constructor(private readonly auth: AuthService) {
    this.flow = new SessionFlow(auth, () => {
      this.pushState();
      void this.syncChat();
    });
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
    if (!this.bootstrapped) {
      this.bootstrapped = true;
      void this.flow.bootstrap();
    } else {
      this.pushState();
    }
  }

  reloadConfig(): void {
    this.flow.reloadConfig(readApiConfigFromWorkspace());
    this.socketToken = undefined;
    void this.syncChat();
  }

  private pushState(): void {
    if (!this.view) return;
    void this.view.webview.postMessage(createStateMessage(this.flow.snapshot()));
  }

  private async syncChat(): Promise<void> {
    const state = this.flow.snapshot();
    if (!state.authenticated || state.phase !== "ready") {
      this.socketToken = undefined;
      this.chat.close();
      return;
    }
    const token = await this.auth.getAccessToken();
    if (!token || token === this.socketToken) return;
    this.socketToken = token;
    this.chat.connect(chatSocketUrl(this.auth.apiConfig.baseUrl), token, (frame) => {
      const message = messageFromFrame(frame);
      if (message) this.flow.ingestLiveMessage(message);
    });
  }
}

export function readApiConfigFromWorkspace() {
  const settings = vscode.workspace.getConfiguration("devconnect");
  return createApiConfig({
    baseUrl: settings.get<string>("apiBaseUrl") ?? "https://localhost/api/v1",
    timeoutMs: settings.get<number>("requestTimeoutMs") ?? 15_000,
    allowInsecureHttp: settings.get<boolean>("allowInsecureHttp") ?? false,
  });
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

  const provider = new DevConnectViewProvider(auth);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("devconnect.home", provider),
    vscode.commands.registerCommand("devconnect.open", () => vscode.commands.executeCommand("workbench.view.extension.devconnect")),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("devconnect")) provider.reloadConfig();
    }),
  );
}

export function deactivate(): void {}
