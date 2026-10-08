import { randomBytes } from "node:crypto";
import type { Webview } from "vscode";
import type {
  ConversationDto,
  DeviceDto,
  FriendRequestDto,
  NotificationDto,
  UserProfileDto,
  UserSummaryDto,
} from "../shared/api-types";
import type { ScreenId } from "../shared/flow";
import type { HostMessage } from "../shared/protocol";
import type { DisplayMessage } from "./auth-service";
import { TYPING_IDLE_MS, typingCommand } from "./typing-debounce";

export interface HostState {
  readonly phase: "checking" | "ready";
  readonly screen: ScreenId;
  readonly canGoBack: boolean;
  readonly authenticated: boolean;
  readonly insecureHttp: boolean;
  readonly e2eeEnabled: boolean;
  readonly user: UserProfileDto | null;
  readonly selectedUser: UserProfileDto | null;
  readonly error: string | null;
  readonly notice: string | null;
  readonly busy: boolean;
  readonly searchResults: readonly UserSummaryDto[];
  readonly friends: readonly UserSummaryDto[];
  readonly incomingRequests: readonly FriendRequestDto[];
  readonly outgoingRequests: readonly FriendRequestDto[];
  readonly conversations: readonly ConversationDto[];
  readonly activeConversationId: string | null;
  readonly messages: readonly DisplayMessage[];
  readonly notifications: readonly NotificationDto[];
  readonly unreadNotifications: number;
  readonly unreadMessages: number;
  readonly connection: "offline" | "connecting" | "connected" | "reconnecting";
  readonly toast: string | null;
  readonly toastSeq: number;
  readonly devices: readonly DeviceDto[];
  readonly blockedUsers: readonly UserSummaryDto[];
  readonly avatars: Readonly<Record<string, string>>;
  readonly messageLock: "none" | "blocked-by-me" | "blocked-me";
  readonly notifyMessages: boolean;
  readonly notifyFriendRequests: boolean;
  readonly notifyFriendAccepted: boolean;
  readonly friendsPanel: "friends" | "requests" | "sent";
  readonly friendsPanelSeq: number;
  readonly unreadByConversation: Readonly<Record<string, number>>;
  readonly conversationPreviews: Readonly<Record<string, string>>;
  readonly presenceByUser: Readonly<Record<string, { status: "ONLINE" | "OFFLINE"; lastSeenAt?: string | null }>>;
  readonly typing: { conversationId: string; userId: string } | null;
}

export function emptyHostState(): HostState {
  return {
    phase: "checking",
    screen: "splash",
    canGoBack: false,
    authenticated: false,
    insecureHttp: false,
    e2eeEnabled: false,
    user: null,
    selectedUser: null,
    error: null,
    notice: null,
    busy: false,
    searchResults: [],
    friends: [],
    incomingRequests: [],
    outgoingRequests: [],
    conversations: [],
    activeConversationId: null,
    messages: [],
    notifications: [],
    unreadNotifications: 0,
    unreadMessages: 0,
    connection: "offline",
    toast: null,
    toastSeq: 0,
    devices: [],
    blockedUsers: [],
    avatars: {},
    messageLock: "none",
    notifyMessages: true,
    notifyFriendRequests: true,
    notifyFriendAccepted: true,
    friendsPanel: "friends",
    friendsPanelSeq: 0,
    unreadByConversation: {},
    conversationPreviews: {},
    presenceByUser: {},
    typing: null,
  };
}

export function renderWebview(webview: Webview, state: HostState): string {
  const nonce = randomBytes(18).toString("base64");
  const initialState = JSON.stringify(state).replace(/</g, "\\u003c");
  const csp = [
    "default-src 'none'",
    `style-src 'nonce-${nonce}'`,
    `script-src 'nonce-${nonce}'`,
    `img-src ${webview.cspSource} data:`,
    "font-src 'none'",
    "connect-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DevConnect</title>
    <style nonce="${nonce}">
      :root { color-scheme: light dark; --dc-gap: 8px; --dc-radius: 8px; }
      * { box-sizing: border-box; }
  body { margin: 0; color: var(--vscode-foreground); background: var(--vscode-sideBar-background); font-family: var(--vscode-font-family); font-size: 13px; }
  button, input, textarea, select { font: inherit; color: inherit; }
  button { cursor: pointer; }
  button:disabled, input:disabled, textarea:disabled { opacity: .55; cursor: default; }
  button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible, .nav-btn:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
  [hidden] { display: none !important; }
  @media (forced-colors: active) {
    .mark, .card, .btn, .banner, .msg, .nav-btn, .user-row { border: 1px solid CanvasText; forced-color-adjust: auto; }
    .btn.primary, .nav-btn[aria-current="page"] { background: Highlight; color: HighlightText; }
    .banner.error { color: CanvasText; }
  }
  .app { min-height: 100vh; container-type: inline-size; }
  .shell { min-height: 100vh; display: flex; }
  .side { width: 168px; flex: none; display: flex; flex-direction: column; gap: 8px; padding: 12px 8px; border-right: 1px solid var(--vscode-panel-border); background: var(--vscode-sideBar-background); }
  .brand-row { display: flex; align-items: center; gap: 8px; padding: 0 8px 8px; }
  .mark { width: 22px; height: 22px; display: grid; place-items: center; color: var(--vscode-foreground); flex: none; }
  .mark svg, .ico { width: 16px; height: 16px; display: block; }
  .brand { font-weight: 650; font-size: 13px; }
  .nav-list { display: grid; gap: 2px; }
  .nav-btn { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 32px; border: 0; border-radius: 6px; background: transparent; padding: 0 8px; text-align: left; color: var(--vscode-foreground); }
  .nav-btn[aria-current="page"] { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
  .nav-btn:hover { background: var(--vscode-list-hoverBackground); }
  .nav-label { flex: 1; min-width: 0; }
  .side-gap { height: 8px; }
  .side-user { margin-top: auto; display: flex; align-items: center; gap: 8px; padding: 8px; min-width: 0; }
  .side-user strong, .side-user span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .stage { flex: 1; min-width: 0; display: flex; flex-direction: column; background: var(--vscode-editor-background); }
  .top { display: flex; align-items: center; gap: 8px; min-height: 36px; padding: 8px 12px; }
  .back, .btn { min-height: 28px; border: 1px solid var(--vscode-panel-border); border-radius: 6px; background: transparent; padding: 0 10px; }
  .btn.primary { border-color: transparent; background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  .btn.quiet { border-color: transparent; background: transparent; color: var(--vscode-textLink-foreground, var(--vscode-foreground)); padding: 0; min-height: 24px; }
  .btn.danger { color: var(--vscode-errorForeground); }
  .avatar, .avatar-img { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; flex: none; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
  .avatar { display: grid; place-items: center; font-weight: 650; font-size: 13px; }
  .avatar.sm, .avatar-img.sm { width: 28px; height: 28px; font-size: 11px; }
  .avatar.lg, .avatar-img.lg { width: 72px; height: 72px; font-size: 24px; }
  .file-btn { position: relative; overflow: hidden; display: inline-flex; align-items: center; }
  .file-btn input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  main { padding: 4px 16px 20px; display: flex; flex-direction: column; gap: 12px; flex: 1; min-height: 0; }
  section[data-screen="messages"]:not([hidden]) { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  h1 { margin: 0; font-size: 18px; font-weight: 640; letter-spacing: -0.01em; }
  h2 { margin: 4px 0 0; font-size: 13px; font-weight: 640; }
  p { margin: 0; }
  .muted { color: var(--vscode-descriptionForeground); font-size: 12px; line-height: 1.45; }
  .stack { display: grid; gap: 8px; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  label { display: grid; gap: 4px; font-size: 12px; color: var(--vscode-descriptionForeground); }
  input, textarea, select { width: 100%; min-height: 32px; padding: 6px 8px; border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius: 6px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); }
  textarea { min-height: 72px; resize: vertical; }
  .search-field { position: relative; }
  .search-field .ico { position: absolute; left: 10px; top: 8px; color: var(--vscode-descriptionForeground); }
  .search-field input { padding-left: 32px; }
  .card, .user-row, .setting-row { display: flex; gap: 10px; align-items: center; padding: 8px; border-radius: var(--dc-radius); }
  .user-row { width: 100%; text-align: left; background: transparent; border: 0; color: inherit; }
  .user-row:hover, .note:hover, .setting-row:hover { background: var(--vscode-list-hoverBackground); }
  .person-copy, .note-copy { display: grid; gap: 2px; min-width: 0; flex: 1; }
  .person-copy strong, .note-copy strong { font-size: 13px; font-weight: 600; }
  .banner { padding: 8px 10px; border-radius: 6px; font-size: 12px; }
  .banner.error { color: var(--vscode-errorForeground); background: color-mix(in srgb, var(--vscode-errorForeground) 12%, transparent); }
  .banner.notice { background: color-mix(in srgb, var(--vscode-focusBorder) 14%, transparent); }
  .msg { max-width: 82%; padding: 8px 10px; border-radius: 10px; background: color-mix(in srgb, var(--vscode-foreground) 8%, transparent); white-space: pre-wrap; word-break: break-word; }
  .msg.mine { margin-left: auto; background: color-mix(in srgb, var(--vscode-button-background) 28%, transparent); }
  .profile-head { display: grid; justify-items: center; text-align: center; gap: 4px; padding: 8px 0 4px; }
  .stats { display: flex; gap: 16px; justify-content: center; }
  .stats div { display: grid; justify-items: center; }
  .stats strong { font-size: 16px; }
  .tabs { display: flex; gap: 4px; }
  .tabs .btn[aria-selected="true"] { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); border-color: transparent; }
  .splash { min-height: 70vh; display: grid; place-items: center; text-align: center; gap: 8px; }
  .spinner { width: 28px; height: 28px; margin: 8px auto 0; border: 2px solid var(--vscode-panel-border); border-top-color: var(--vscode-focusBorder); border-radius: 50%; }
  @media (prefers-reduced-motion: no-preference) {
    .spinner { animation: spin 800ms linear infinite; }
    .typing i { animation: blink 1.2s infinite; }
    .typing i:nth-child(2) { animation-delay: .2s; }
    .typing i:nth-child(3) { animation-delay: .4s; }
    @keyframes blink { 50% { opacity: .2; } }
    .nav-btn { transition: background 120ms linear; }
    @keyframes spin { to { transform: rotate(360deg); } }
  }
  .badge { min-width: 16px; height: 16px; padding: 0 4px; border-radius: 8px; display: inline-grid; place-items: center; background: var(--vscode-activityBarBadge-background, var(--vscode-badge-background)); color: var(--vscode-activityBarBadge-foreground, var(--vscode-badge-foreground)); font-size: 10px; }
  .person, .note, .setting-row { display: flex; gap: 10px; align-items: center; width: 100%; text-align: left; background: transparent; border: 0; border-radius: 8px; padding: 8px; color: inherit; }
  .note.unread { background: color-mix(in srgb, var(--vscode-list-inactiveSelectionBackground, var(--vscode-list-hoverBackground)) 80%, transparent); }
  .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; background: var(--vscode-activityBarBadge-background, var(--vscode-badge-background)); }
  .presence { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 4px; vertical-align: 1px; background: var(--vscode-disabledForeground); }
  .presence[data-state="online"] { background: var(--vscode-testing-iconPassed, var(--vscode-charts-green, var(--vscode-focusBorder))); }
  .typing i { display: inline-block; width: 4px; height: 4px; margin-right: 3px; border-radius: 50%; background: var(--vscode-descriptionForeground); }
  .thread-head { display: flex; align-items: center; gap: 8px; }
  .thread-person { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1; }
  .thread-person strong, .thread-person span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .icon-btn { width: 28px; min-width: 28px; padding: 0; }
  #thread { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 8px; }
  .composer { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: end; position: sticky; bottom: 0; padding: 8px 0; background: var(--vscode-editor-background); }
  .composer textarea { min-height: 36px; max-height: 120px; }
  .send-btn { width: 32px; min-height: 32px; border-radius: 16px; padding: 0; }
  .chat-empty { display: grid; justify-items: center; text-align: center; gap: 6px; padding: 32px 12px; }
  .msg-meta { margin-top: 4px; font-size: 11px; color: var(--vscode-descriptionForeground); }
  .msg.failed { outline: 1px solid var(--vscode-errorForeground); }
  .toast { position: sticky; bottom: 8px; margin: 8px 12px; padding: 8px 10px; border-radius: 8px; background: var(--vscode-notifications-background, var(--vscode-editorWidget-background)); color: var(--vscode-notifications-foreground, var(--vscode-foreground)); border: 1px solid var(--vscode-notifications-border, var(--vscode-panel-border)); }
  .status { margin-left: auto; font-size: 11px; color: var(--vscode-descriptionForeground); }
  #message-list { flex: 1; min-height: 120px; overflow: auto; display: flex; flex-direction: column; gap: 8px; padding: 4px 0; }
  .empty { display: grid; gap: 6px; padding: 20px 4px; }
  .skel { height: 12px; border-radius: 4px; background: color-mix(in srgb, var(--vscode-descriptionForeground) 22%, transparent); }
  .skel-row { height: 44px; border-radius: 8px; background: color-mix(in srgb, var(--vscode-descriptionForeground) 12%, transparent); }
  .dialog-back { position: fixed; inset: 0; background: color-mix(in srgb, var(--vscode-editor-background) 35%, transparent); display: grid; place-items: center; padding: 16px; }
  .dialog { width: min(320px, 100%); display: grid; gap: 12px; padding: 16px; border-radius: 10px; background: var(--vscode-editorWidget-background, var(--vscode-editor-background)); color: var(--vscode-editorWidget-foreground, var(--vscode-foreground)); border: 1px solid var(--vscode-editorWidget-border, var(--vscode-panel-border)); }
  .choice { display: grid; grid-template-columns: auto 1fr; gap: 4px 8px; align-items: start; padding: 8px; border-radius: 8px; }
  .choice input { width: auto; margin-top: 2px; }
  .toggle { width: 36px; height: 20px; border-radius: 10px; border: 0; background: var(--vscode-input-background); position: relative; flex: none; }
  .toggle[aria-pressed="true"] { background: var(--vscode-button-background); }
  .toggle i { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: var(--vscode-button-foreground, var(--vscode-foreground)); }
  .toggle[aria-pressed="true"] i { left: 18px; }
  @container (max-width: 460px) {
    .side { width: 52px; padding-inline: 6px; }
    .brand, .nav-label, .side-copy { display: none; }
    .nav-btn, .brand-row, .side-user { justify-content: center; padding-inline: 0; }
    .badge { position: absolute; margin-left: 18px; }
    .nav-btn { position: relative; }
  }
    </style>
  </head>
  <body>
<div class="app">
<div class="shell">
  <aside class="side" id="app-nav" aria-label="DevConnect" hidden>
    <div class="brand-row">
      <div class="mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M9.15 3.9 2.9 12l6.25 8.1 1.62-1.25L5.55 12l5.22-6.85L9.15 3.9Zm5.7 0-1.62 1.25L18.45 12l-5.22 6.85 1.62 1.25L21.1 12 14.85 3.9ZM11 9.15h2v5.7h-2v-5.7Z"/></svg></div>
      <div class="brand">DevConnect</div>
    </div>
    <nav class="nav-list">
      <button class="nav-btn" type="button" data-go="home" title="Home"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 10.5 12 4l8 6.5V20h-6v-6H10v6H4V10.5Z"/></svg><span class="nav-label">Home</span></button>
      <button class="nav-btn" type="button" data-go="search" title="Search"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Zm5.2-2.3 4.3 4.3"/></svg><span class="nav-label">Search</span></button>
      <button class="nav-btn" type="button" data-go="friends" title="Friends"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 1a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM2.5 18.5c.4-2.6 2.6-4 5.5-4s5.1 1.4 5.5 4v1h-11v-1Zm9.2-.4c.5-1.8 2-3.1 4.3-3.1 2.2 0 3.8 1.2 4.3 3.1.1.4.2.8.2 1.4v.5h-9v-.5c0-.6.1-1 .2-1.4Z"/></svg><span class="nav-label">Friends</span><span class="badge" id="friend-badge" hidden>0</span></button>
      <button class="nav-btn" type="button" data-go="messages" title="Messages"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-5 3.2V6a1 1 0 0 1 1-1Z"/></svg><span class="nav-label">Messages</span><span class="badge" id="message-badge" hidden>0</span></button>
      <button class="nav-btn" type="button" data-go="notifications" title="Alerts"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3a5 5 0 0 0-5 5v2.2L5.3 13.4A1 1 0 0 0 6.1 15h11.8a1 1 0 0 0 .8-1.6L17 10.2V8a5 5 0 0 0-5-5Zm0 18a2.5 2.5 0 0 0 2.4-2h-4.8A2.5 2.5 0 0 0 12 21Z"/></svg><span class="nav-label">Alerts</span><span class="badge" id="badge" hidden>0</span></button>
      <div class="side-gap"></div>
      <button class="nav-btn" type="button" data-go="profile" title="Profile"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8.2c.6-3.2 3.2-5.2 7-5.2s6.4 2 7 5.2c.1.6-.3 1.3-1 1.3H6c-.7 0-1.1-.7-1-1.3Z"/></svg><span class="nav-label">Profile</span></button>
      <button class="nav-btn" type="button" data-go="settings" title="Settings"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 8.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 0 0 12 8.5Zm8.2 3.1-1.7-.3a6.7 6.7 0 0 0-.8-1.9l1-1.4-1.7-1.7-1.4 1a6.7 6.7 0 0 0-1.9-.8l-.3-1.7h-2.4l-.3 1.7a6.7 6.7 0 0 0-1.9.8l-1.4-1-1.7 1.7 1 1.4a6.7 6.7 0 0 0-.8 1.9l-1.7.3v2.4l1.7.3c.2.7.5 1.3.8 1.9l-1 1.4 1.7 1.7 1.4-1c.6.3 1.2.6 1.9.8l.3 1.7h2.4l.3-1.7c.7-.2 1.3-.5 1.9-.8l1.4 1 1.7-1.7-1-1.4c.3-.6.6-1.2.8-1.9l1.7-.3v-2.4Z"/></svg><span class="nav-label">Settings</span></button>
    </nav>
    <div class="side-user" id="side-user"></div>
  </aside>
  <div class="stage">
  <header class="top">
    <button class="back" id="back-btn" type="button" hidden>Back</button>
    <span class="status" id="live-status" hidden>Reconnecting…</span>
  </header>
  <main>
    <p class="banner error" id="error" hidden></p>
    <button class="btn" type="button" id="retry" hidden>Try again</button>
    <p class="banner notice" id="notice" hidden></p>

    <section data-screen="splash" class="splash">
      <div>
        <div class="mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M9.15 3.9 2.9 12l6.25 8.1 1.62-1.25L5.55 12l5.22-6.85L9.15 3.9Zm5.7 0-1.62 1.25L18.45 12l-5.22 6.85 1.62 1.25L21.1 12 14.85 3.9ZM11 9.15h2v5.7h-2v-5.7Z"/></svg></div>
        <h1>DevConnect</h1>
        <p class="muted">Connect. Collaborate. Code.</p>
        <div class="spinner" role="status" aria-label="Checking session"></div>
      </div>
    </section>

    <section data-screen="login" class="stack" hidden>
      <h1>Sign in</h1>
      <p class="muted">Use your DevConnect username or email.</p>
      <p class="muted" id="http-warn" hidden>This API is HTTP. Do not use a production password here.</p>
      <form id="login-form" class="stack">
        <label>Username or email<input name="usernameOrEmail" autocomplete="username" required maxlength="254"></label>
        <label>Password<span class="row"><input name="password" type="password" autocomplete="current-password" required maxlength="128"><button class="btn" type="button" data-toggle>Show</button></span></label>
        <button class="btn primary" type="submit">Sign in</button>
      </form>
      <div class="row">
        <button class="btn" type="button" data-go="forgot">Forgot password</button>
        <button class="btn" type="button" data-go="signup">Create account</button>
      </div>
    </section>

    <section data-screen="signup" class="stack" hidden>
      <h1>Create account</h1>
      <form id="signup-form" class="stack">
        <label>Username<input name="username" required minlength="3" maxlength="30"></label>
        <label>Email<input name="email" type="email" required maxlength="254"></label>
        <label>Display name<input name="displayName" required maxlength="50"></label>
        <label>Password<span class="row"><input name="password" type="password" required minlength="10" maxlength="128"><button class="btn" type="button" data-toggle>Show</button></span></label>
        <p class="muted">Use 10–128 characters, including a letter and a digit. No spaces.</p>
        <button class="btn primary" type="submit">Create account</button>
      </form>
      <button class="btn" type="button" data-go="login">Back to sign in</button>
    </section>

    <section data-screen="forgot" class="stack" hidden>
      <h1>Forgot password</h1>
      <p class="muted">Enter the email on your account. The response does not reveal whether that mailbox exists.</p>
      <form id="forgot-form" class="stack">
        <label>Email<input name="email" type="email" required maxlength="254"></label>
        <button class="btn primary" type="submit">Send reset</button>
      </form>
      <button class="btn" type="button" data-go="reset">I have a reset token</button>
      <button class="btn" type="button" data-go="login">Back to sign in</button>
    </section>

    <section data-screen="reset" class="stack" hidden>
      <h1>Reset password</h1>
      <form id="reset-form" class="stack">
        <label>Reset token<input name="token" required maxlength="512"></label>
        <label>New password<span class="row"><input name="newPassword" type="password" required minlength="10" maxlength="128"><button class="btn" type="button" data-toggle>Show</button></span></label>
        <button class="btn primary" type="submit">Update password</button>
      </form>
      <button class="btn" type="button" data-go="login">Back to sign in</button>
    </section>

    <section data-screen="home" class="stack" hidden>
      <h1 id="home-title">Home</h1>
      <p class="muted" id="home-copy"></p>
      <div class="stats" id="home-stats"></div>
      <h2>Recent activity</h2>
      <div id="home-activity" class="stack"></div>
    </section>

    <section data-screen="search" class="stack" hidden>
      <h1>Search</h1>
      <p class="muted">Find people in your developer network.</p>
      <form id="search-form">
        <label class="search-field">Search developers
          <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Zm5.2-2.3 4.3 4.3"/></svg>
          <input id="search-query" name="query" maxlength="80" placeholder="Username or name">
        </label>
      </form>
      <div id="search-status" class="stack" hidden>
        <div class="skel-row"></div>
        <div class="skel-row"></div>
      </div>
      <div id="search-list" class="stack"></div>
    </section>

    <section data-screen="user" class="stack" hidden>
      <div class="profile-head">
        <div id="user-avatar"></div>
        <h1 id="user-name">Profile</h1>
        <p class="muted" id="user-meta"></p>
        <p id="user-bio"></p>
        <div class="row" id="user-actions"></div>
      </div>
    </section>

    <section data-screen="friends" class="stack" hidden>
      <h1>Friends</h1>
      <div class="tabs" id="friend-tabs">
        <button class="btn" type="button" data-friend-tab="friends" aria-selected="true">Friends</button>
        <button class="btn" type="button" data-friend-tab="requests">Requests</button>
        <button class="btn" type="button" data-friend-tab="sent">Sent</button>
      </div>
      <div id="friends-list" class="stack"></div>
      <div id="incoming-list" class="stack" hidden></div>
      <div id="outgoing-list" class="stack" hidden></div>
    </section>

    <section data-screen="messages" class="stack" hidden>
      <div id="inbox" class="stack">
        <h1>Messages</h1>
        <p class="muted" id="crypto-note"></p>
        <label class="search-field">Search conversations
          <input id="chat-filter" type="search" placeholder="Search conversations" autocomplete="off">
        </label>
        <div id="chat-list" class="stack"></div>
      </div>
      <div id="thread" hidden>
        <div class="thread-head">
          <button class="btn quiet" type="button" id="thread-back">← Messages</button>
        </div>
        <div class="thread-person">
          <div id="thread-avatar"></div>
          <div>
            <strong id="thread-name">Chat</strong>
            <div class="muted" id="thread-user"></div>
          </div>
          <button class="btn icon-btn" type="button" id="thread-profile" data-act="open-user" aria-label="View profile">↗</button>
        </div>
        <p class="muted" id="thread-connection" hidden>Reconnecting...</p>
        <div id="message-list"></div>
        <button class="btn" type="button" id="jump-latest" hidden>↓ New messages</button>
        <p class="muted" id="thread-block" hidden>You blocked this user.</p>
        <form id="message-form" class="composer">
          <label>Message
            <textarea name="text" maxlength="4000" rows="1" placeholder="Write a message..."></textarea>
          </label>
          <button class="btn primary send-btn" id="send-btn" type="submit" aria-label="Send" disabled>➤</button>
        </form>
      </div>
    </section>

    <section data-screen="notifications" class="stack" hidden>
      <div class="row">
        <h1>Notifications</h1>
        <button class="btn quiet" type="button" id="read-all">Mark all read</button>
      </div>
      <div id="note-list" class="stack"></div>
    </section>

    <section data-screen="profile" class="stack" hidden>
      <div id="profile-view" class="profile-head">
        <div id="me-avatar"></div>
        <h1 id="me-name">Profile</h1>
        <p class="muted" id="me-line"></p>
        <p id="me-bio"></p>
        <div class="row">
          <button class="btn" type="button" id="edit-profile">Edit profile</button>
        </div>
      </div>
      <form id="profile-form" class="stack" hidden>
        <div class="row">
          <button class="btn quiet" type="button" id="close-edit">Profile</button>
        </div>
        <div id="edit-avatar"></div>
        <div class="row">
          <label class="btn file-btn">Change photo<input id="avatar-file" type="file" accept="image/jpeg,image/png,image/webp"></label>
          <button class="btn" type="button" id="remove-avatar">Remove photo</button>
        </div>
        <p class="field-error muted" id="avatar-error" hidden></p>
        <label>Display name<input name="displayName" required maxlength="50"></label>
        <p class="muted" id="username-line"></p>
        <label>Bio<textarea name="bio" maxlength="500"></textarea></label>
        <label>Account privacy<select name="accountType"><option value="PUBLIC">Public</option><option value="PRIVATE">Private</option></select></label>
        <button class="btn primary" type="submit">Save changes</button>
        <button class="btn" type="button" id="resend-verify">Resend verification email</button>
      </form>
    </section>

    <section data-screen="settings" class="stack" hidden>
      <div id="settings-menu" class="stack">
        <h1>Settings</h1>
        <button class="setting-row" type="button" data-settings="account"><span class="person-copy"><strong>Account</strong><span class="muted">Profile, username, password</span></span></button>
        <button class="setting-row" type="button" data-settings="privacy"><span class="person-copy"><strong>Privacy</strong><span class="muted">Public or private, blocked accounts</span></span></button>
        <button class="setting-row" type="button" data-settings="notifications"><span class="person-copy"><strong>Notifications</strong><span class="muted">Messages and friend requests</span></span></button>
        <button class="setting-row" type="button" data-settings="security"><span class="person-copy"><strong>Security</strong><span class="muted">Devices and sign out</span></span></button>
        <button class="setting-row" type="button" data-settings="about"><span class="person-copy"><strong>About</strong><span class="muted">DevConnect</span></span></button>
      </div>
      <div id="settings-account" class="stack" hidden>
        <button class="btn quiet" type="button" data-settings="menu">Settings</button>
        <h1>Account</h1>
        <button class="setting-row" type="button" data-go="profile"><span class="person-copy"><strong>Profile</strong><span class="muted">Photo, name, and bio</span></span></button>
        <p class="muted" id="account-username"></p>
        <p class="muted" id="account-email"></p>
        <form id="password-form" class="stack">
          <h2>Password</h2>
          <p class="muted">Changing your password signs you out on every device.</p>
          <label>Current password<input name="currentPassword" type="password" required maxlength="128"></label>
          <label>New password<input name="newPassword" type="password" required minlength="10" maxlength="128"></label>
          <button class="btn primary" type="submit">Update password</button>
        </form>
      </div>
      <div id="settings-privacy" class="stack" hidden>
        <button class="btn quiet" type="button" data-settings="menu">Settings</button>
        <h1>Privacy</h1>
        <label class="choice"><input type="radio" name="privacyMode" value="PUBLIC" id="privacy-public"><span><strong>Public</strong><span class="muted">Anyone can discover your profile.</span></span></label>
        <label class="choice"><input type="radio" name="privacyMode" value="PRIVATE" id="privacy-private"><span><strong>Private</strong><span class="muted">New people need approval before they can see more than your basic profile.</span></span></label>
        <div class="setting-row"><span class="person-copy"><strong>Activity status</strong><span class="muted">Friends can see when you are online. Turning this off hides it on the server.</span></span><button class="toggle" type="button" id="activity-status" aria-pressed="true" aria-label="Activity status"><i></i></button></div>
        <h2>Blocked accounts</h2>
        <div id="blocked-list" class="stack"></div>
      </div>
      <div id="settings-notifications" class="stack" hidden>
        <button class="btn quiet" type="button" data-settings="menu">Settings</button>
        <h1>Notifications</h1>
        <div class="setting-row"><span class="person-copy"><strong>Messages</strong><span class="muted">When a chat is not open</span></span><button class="toggle" type="button" id="notify-messages" aria-pressed="true" aria-label="Messages"><i></i></button></div>
        <div class="setting-row"><span class="person-copy"><strong>Friend requests</strong><span class="muted">When someone wants to connect</span></span><button class="toggle" type="button" id="notify-requests" aria-pressed="true" aria-label="Friend requests"><i></i></button></div>
        <div class="setting-row"><span class="person-copy"><strong>Friend accepted</strong><span class="muted">When a request is accepted</span></span><button class="toggle" type="button" id="notify-accepted" aria-pressed="true" aria-label="Friend accepted"><i></i></button></div>
      </div>
      <div id="settings-security" class="stack" hidden>
        <button class="btn quiet" type="button" data-settings="menu">Settings</button>
        <h1>Security</h1>
        <div id="device-list" class="stack"></div>
        <button class="btn danger" type="button" id="logout-btn">Log out</button>
      </div>
      <div id="settings-about" class="stack" hidden>
        <button class="btn quiet" type="button" data-settings="menu">Settings</button>
        <h1>About</h1>
        <p>DevConnect</p>
        <p class="muted" id="about-version">Version 0.4.10</p>
        <p class="muted">A developer network inside Visual Studio Code. Messages stay encrypted on your devices.</p>
      </div>
    </section>
      </main>
  </div>
</div>
  <div class="dialog-back" id="dialog" hidden>
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-text">
      <p id="dialog-text"></p>
      <div class="row">
        <button class="btn" type="button" id="dialog-cancel">Cancel</button>
        <button class="btn primary" type="button" id="dialog-ok">Confirm</button>
      </div>
    </div>
  </div>
  <p class="toast" id="toast" hidden></p>
    </div>
    <script nonce="${nonce}">
      (() => {
        const vscode = acquireVsCodeApi();
  const screens = ["splash","login","signup","forgot","reset","home","search","user","friends","messages","notifications","profile","settings"];
  let state = ${initialState};
  let toastSeq = -1;
  let toastTimer = 0;
  let searchTimer = 0;
  let friendTab = "friends";
  let seenPanelSeq = -1;
  let chatQuery = "";
  let lastThreadId = "";
  let lastMessageCount = 0;
  let heldNew = 0;
  let typingOn = false;
  let typingStopTimer = 0;
  const typingCommand = ${typingCommand.toString()};
  const TYPING_IDLE_MS = ${TYPING_IDLE_MS};
  let settingsPane = "menu";
  let editing = false;
  let dialogAction = null;

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" })[ch]);
  }
  function isState(value) {
    return value && value.version === 1 && value.type === "state" && screens.includes(value.screen) && typeof value.e2eeEnabled === "boolean";
  }
  function initial(value) {
    const text = String(value || "").trim();
    return (text[0] || "D").toUpperCase();
  }
  function when(iso) {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    const delta = Date.now() - date.getTime();
    const minute = 60000;
    if (delta < minute) return "now";
    if (delta < 60 * minute) return Math.floor(delta / minute) + "m";
    if (delta < 24 * 60 * minute) return Math.floor(delta / (60 * minute)) + "h";
    if (delta < 7 * 24 * 60 * minute) return Math.floor(delta / (24 * 60 * minute)) + "d";
    return date.toLocaleDateString();
  }
  function clock(iso) {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  function chatPerson(conversation) {
    return {
      name: conversation.peerDisplayName || "Developer",
      username: conversation.peerUsername || "",
    };
  }
  function avatarMarkup(person, size) {
    const url = person && person.profileImageUrl ? String(person.profileImageUrl) : "";
    const id = url.split("/").filter(Boolean).pop();
    const src = id && state.avatars ? state.avatars[id] : "";
    const label = "Profile picture of " + ((person && (person.displayName || person.username)) || "user");
    const klass = size === "lg" ? " lg" : size === "sm" ? " sm" : "";
    if (typeof src === "string" && src.indexOf("data:image/") === 0) {
      return '<img class="avatar-img' + klass + '" alt="' + esc(label) + '" src="' + src + '">';
    }
    return '<span class="avatar' + klass + '" role="img" aria-label="' + esc(label) + '">' + esc(initial(person && (person.displayName || person.username))) + '</span>';
  }
  function relText(relationship) {
    if (relationship === "FRIENDS") return "Friends";
    if (relationship === "OUTGOING_REQUEST") return "Request sent";
    if (relationship === "INCOMING_REQUEST") return "Request received";
    if (relationship === "BLOCKED") return "Blocked";
    return "";
  }
  function userActions(person) {
    const id = esc(person.id);
    if (person.relationship === "FRIENDS") return '<button class="btn" data-act="message" data-id="' + id + '">Message</button>';
    if (person.relationship === "OUTGOING_REQUEST") return '<span class="muted">Request sent</span>';
    if (person.relationship === "INCOMING_REQUEST") return '<span class="muted">Request received</span>';
    if (person.relationship === "BLOCKED") return "";
    return '<button class="btn primary" data-act="friend" data-id="' + id + '">Connect</button>';
  }
  function presenceFor(userId, person) {
    const live = state.presenceByUser && userId ? state.presenceByUser[userId] : null;
    return live || (person && person.presence) || null;
  }
  function presenceText(presence) {
    if (!presence || !presence.status) return "";
    if (presence.status === "ONLINE") return "Online";
    if (presence.lastSeenAt) return "Last seen " + when(presence.lastSeenAt);
    return "Offline";
  }
  function countText(count) {
    if (!count) return "";
    return count > 99 ? "99+" : String(count);
  }
  function userRow(person, extra) {
    const privacy = person.accountType === "PRIVATE" ? "Private" : "";
    const relation = relText(person.relationship);
    const activity = person.relationship === "FRIENDS" || (presenceFor(person.id, person) && presenceFor(person.id, person).status === "ONLINE")
      ? presenceText(presenceFor(person.id, person))
      : "";
    const meta = ["@" + person.username, privacy, relation, activity].filter(Boolean).join(" · ");
    return '<div class="user-row">' + avatarMarkup(person, "md") + '<span class="person-copy"><strong>' + esc(person.displayName) + '</strong><span class="muted">' + esc(meta) + '</span></span><span class="row">'
      + '<button class="btn quiet" data-act="open-user" data-id="' + esc(person.id) + '">Profile</button>'
      + (extra || userActions(person))
      + '</span></div>';
  }
  function emptyState(title, copy, action) {
    return '<div class="empty"><strong>' + esc(title) + '</strong><p class="muted">' + esc(copy) + '</p>' + (action || "") + '</div>';
  }
  function apply(next) {
    state = next;
    const visible = state.phase === "checking" ? "splash" : state.screen;
    document.querySelectorAll("[data-screen]").forEach((el) => { el.hidden = el.getAttribute("data-screen") !== visible; });
    document.getElementById("app-nav").hidden = !(state.authenticated && state.phase === "ready");
    const inThread = visible === "messages" && !!state.activeConversationId;
    document.getElementById("back-btn").hidden = state.phase === "checking" || inThread || !state.canGoBack;
    if ((state.friendsPanelSeq || 0) !== seenPanelSeq) {
      seenPanelSeq = state.friendsPanelSeq || 0;
      friendTab = state.friendsPanel || "friends";
    }
    document.querySelectorAll(".nav-btn").forEach((btn) => {
      if (btn.getAttribute("data-go") === state.screen) btn.setAttribute("aria-current", "page");
      else btn.removeAttribute("aria-current");
    });
    const error = document.getElementById("error");
    const notice = document.getElementById("notice");
    error.hidden = !state.error; error.textContent = state.error || "";
    document.getElementById("retry").hidden = !state.error;
    notice.hidden = !state.notice; notice.textContent = state.notice || "";
    const badge = document.getElementById("badge");
    badge.hidden = !(state.unreadNotifications > 0);
    badge.textContent = countText(state.unreadNotifications || 0);
    const friendBadge = document.getElementById("friend-badge");
    const requestCount = (state.incomingRequests || []).length;
    friendBadge.hidden = requestCount < 1;
    friendBadge.textContent = countText(requestCount);
    const messageBadge = document.getElementById("message-badge");
    messageBadge.hidden = !(state.unreadMessages > 0);
    messageBadge.textContent = countText(state.unreadMessages || 0);
    const live = document.getElementById("live-status");
    live.hidden = state.connection !== "reconnecting" && state.connection !== "connecting";
    live.textContent = state.connection === "reconnecting" ? "Reconnecting…" : "Connecting…";
    const toast = document.getElementById("toast");
    if (state.toast && state.toastSeq !== toastSeq) {
      toastSeq = state.toastSeq;
      toast.hidden = false;
      toast.textContent = state.toast;
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => { toast.hidden = true; }, 4000);
    }
    document.getElementById("http-warn").hidden = !state.insecureHttp;
    const cryptoNote = document.getElementById("crypto-note");
    if (cryptoNote) {
      cryptoNote.textContent = state.e2eeEnabled
        ? "Messages are encrypted on this device for every verified device your friend has published. The server stores ciphertext only."
        : "Encryption keys are not ready on this device yet.";
    }
    const hour = new Date().getHours();
    const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    document.getElementById("home-title").textContent = state.user ? (hello + ", " + (state.user.displayName || state.user.username)) : "Home";
    document.getElementById("home-copy").textContent = "What's happening in your developer network?";
    document.getElementById("home-stats").innerHTML = state.user
      ? '<div><strong>' + (state.friends || []).length + '</strong><span class="muted">Friends</span></div><div><strong>' + (state.incomingRequests || []).length + '</strong><span class="muted">Requests</span></div><div><strong>' + (state.conversations || []).length + '</strong><span class="muted">Chats</span></div>'
      : "";
    const activity = (state.notifications || []).slice(0, 4);
    document.getElementById("home-activity").innerHTML = activity.length
      ? activity.map((note) => '<button class="note" data-act="open-note" data-id="' + esc(note.id) + '"><span class="note-copy"><strong>' + esc(note.message) + '</strong><span class="muted">' + esc(when(note.createdAt)) + '</span></span></button>').join("")
      : emptyState("Your network is quiet right now.", "Search for developers and start connecting.", '<button class="btn primary" type="button" data-go="search">Explore developers</button>');
    const queryBox = document.getElementById("search-query");
    const queryText = queryBox instanceof HTMLInputElement ? queryBox.value.trim() : "";
    const searchStatus = document.getElementById("search-status");
    if (searchStatus) searchStatus.hidden = !(state.busy && visible === "search");
    const results = state.searchResults || [];
    document.getElementById("search-list").innerHTML = results.length
      ? results.map((person) => userRow(person)).join("")
      : queryText.length >= 2
        ? emptyState("No developers found", "Try another username or name.", "")
        : emptyState("Search developers", "Find people in your developer network.", "");
    document.getElementById("friends-list").hidden = friendTab !== "friends";
    document.getElementById("incoming-list").hidden = friendTab !== "requests";
    document.getElementById("outgoing-list").hidden = friendTab !== "sent";
    document.querySelectorAll("[data-friend-tab]").forEach((tab) => {
      tab.setAttribute("aria-selected", tab.getAttribute("data-friend-tab") === friendTab ? "true" : "false");
    });
    document.getElementById("friends-list").innerHTML = (state.friends || []).length
      ? state.friends.map((person) => userRow(person)).join("")
      : emptyState("No friends yet", "Find developers and start connecting.", '<button class="btn primary" type="button" data-go="search">Search developers</button>');
    document.getElementById("incoming-list").innerHTML = (state.incomingRequests || []).length ? state.incomingRequests.map((request) =>
      userRow(request.counterpart, '<button class="btn primary" data-act="accept" data-id="' + esc(request.id) + '">Accept</button><button class="btn" data-act="reject" data-id="' + esc(request.id) + '">Decline</button>')
    ).join("") : emptyState("No requests", "New friend requests show up here.", "");
    document.getElementById("outgoing-list").innerHTML = (state.outgoingRequests || []).length ? state.outgoingRequests.map((request) =>
      userRow(request.counterpart, '<span class="muted">Request sent</span>')
    ).join("") : emptyState("No sent requests", "When you connect with someone, it appears here.", "");
    document.getElementById("inbox").hidden = inThread;
    const chatFilter = document.getElementById("chat-filter");
    const needle = chatQuery.trim().toLowerCase();
    const visibleChats = (state.conversations || []).filter((conversation) => {
      if (!needle) return true;
      const person = chatPerson(conversation);
      const preview = (state.conversationPreviews || {})[conversation.id] || "";
      return (person.name + " " + person.username + " " + preview).toLowerCase().includes(needle);
    });
    document.getElementById("chat-list").innerHTML = (state.conversations || []).length === 0
      ? emptyState("No conversations yet.", "Connect with developers and start a conversation.", '<button class="btn primary" type="button" data-go="search">Find developers</button>')
      : visibleChats.length ? visibleChats.map((conversation) => {
      const person = chatPerson(conversation);
      const preview = (state.conversationPreviews || {})[conversation.id] || "";
      const unread = (state.unreadByConversation || {})[conversation.id] || 0;
      const peerId = state.user ? (conversation.participantIds || []).find((id) => id !== state.user.id) : "";
      const activity = presenceText(presenceFor(peerId));
      const online = activity === "Online" ? '<span class="presence" data-state="online" role="img" aria-label="Online"></span>' : "";
      return '<button class="person" data-act="open-chat" data-id="' + esc(conversation.id) + '">' + avatarMarkup({ displayName: person.name, username: person.username }, "md") + '<span class="person-copy"><strong>' + online + esc(person.name) + '</strong><span class="muted">' + esc(activity || preview || ("@" + (person.username || "developer"))) + '</span></span><span class="muted">' + esc(when(conversation.updatedAt)) + '</span>' + (unread ? '<span class="badge">' + esc(countText(unread)) + '</span>' : '') + '</button>';
    }).join("") : emptyState("No matching conversations", "Try another name.", "");
    if (chatFilter instanceof HTMLInputElement && document.activeElement !== chatFilter && chatFilter.value !== chatQuery) chatFilter.value = chatQuery;
    const thread = document.getElementById("thread");
    thread.hidden = !inThread;
    const openChat = (state.conversations || []).find((item) => item.id === state.activeConversationId);
    const person = openChat ? chatPerson(openChat) : { name: "Chat", username: "" };
    document.getElementById("thread-name").textContent = person.name;
    const otherId = openChat && state.user ? (openChat.participantIds || []).find((id) => id !== state.user.id) : "";
    const threadUser = document.getElementById("thread-user");
    const typingHere = !!(state.typing && state.typing.conversationId === state.activeConversationId);
    if (typingHere) threadUser.innerHTML = '<span class="typing" role="status" aria-label="Typing"><i></i><i></i><i></i>typing</span>';
    else threadUser.textContent = [person.username ? ("@" + person.username) : "", presenceText(presenceFor(otherId))].filter(Boolean).join(" · ");
    const threadAvatar = document.getElementById("thread-avatar");
    if (threadAvatar) threadAvatar.innerHTML = avatarMarkup({ displayName: person.name, username: person.username }, "md");
    const threadProfile = document.getElementById("thread-profile");
    if (threadProfile) {
      threadProfile.hidden = !otherId;
      threadProfile.setAttribute("data-id", otherId || "");
    }
    const blockedPeer = !!(otherId && (state.blockedUsers || []).some((user) => user.id === otherId));
    const lock = state.messageLock === "blocked-me" ? "blocked-me" : (state.messageLock === "blocked-by-me" || blockedPeer) ? "blocked-by-me" : "none";
    const threadBlock = document.getElementById("thread-block");
    const messageForm = document.getElementById("message-form");
    if (threadBlock && messageForm) {
      threadBlock.hidden = lock === "none";
      messageForm.hidden = lock !== "none";
      threadBlock.innerHTML = lock === "blocked-me"
        ? "This conversation is unavailable.<br>You can't message this user."
        : 'You blocked this user. <button class="btn" type="button" data-act="unblock" data-id="' + esc(otherId || "") + '" data-name="' + esc(person.username || person.name) + '">Unblock</button>';
    }
    const list = document.getElementById("message-list");
    const previousTop = list.scrollTop;
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 48;
    const ordered = (state.messages || []).slice().reverse();
    if (state.activeConversationId !== lastThreadId) {
      lastThreadId = state.activeConversationId || "";
      lastMessageCount = 0;
      heldNew = 0;
    }
    list.innerHTML = ordered.length ? ordered.map((m) => {
      const mine = !!(state.user && m.senderId === state.user.id);
      const failed = m.sendState === "failed";
      const status = failed ? "Failed" : m.sendState === "sending" ? "Sending" : m.status === "READ" ? "Read" : m.status === "DELIVERED" ? "Delivered" : "Sent";
      const retry = failed ? '<button class="btn" type="button" data-act="retry-message" data-text="' + esc(m.displayText) + '">Retry</button>' : "";
      return '<div class="msg ' + (mine ? "mine" : "theirs") + (failed ? " failed" : "") + '">' + esc(m.displayText) + '<div class="msg-meta">' + esc(clock(m.createdAt)) + (mine ? " · " + status : "") + '</div>' + (failed ? '<div class="msg-meta">Message failed to send.</div>' + retry : "") + '</div>';
    }).join("") : '<div class="chat-empty">' + avatarMarkup({ displayName: person.name, username: person.username }, "lg") + '<strong>You\\'re connected with ' + esc(person.name) + '</strong><span class="muted">Start the conversation by saying hello.</span></div>';
    if (nearBottom || ordered.length < 2) {
      list.scrollTop = list.scrollHeight;
      heldNew = 0;
    } else {
      list.scrollTop = previousTop;
      if (ordered.length > lastMessageCount) heldNew += ordered.length - lastMessageCount;
    }
    lastMessageCount = ordered.length;
    const jump = document.getElementById("jump-latest");
    jump.hidden = heldNew === 0 || !state.activeConversationId;
    jump.textContent = "↓ " + heldNew + (heldNew === 1 ? " new message" : " new messages");
    document.getElementById("note-list").innerHTML = (state.notifications || []).length ? state.notifications.map((note) =>
      '<button class="note' + (note.read ? "" : " unread") + '" data-act="open-note" data-id="' + esc(note.id) + '">' + avatarMarkup({ displayName: note.message }, "sm") + '<span class="note-copy"><strong>' + esc(note.message) + '</strong><span class="muted">' + esc(when(note.createdAt)) + '</span></span>' + (note.read ? "" : '<span class="dot" aria-label="Unread"></span>') + '</button>'
    ).join("") : emptyState("You're all caught up.", "New requests and messages show up here.", "");
    const sideUser = document.getElementById("side-user");
    if (sideUser) {
      sideUser.innerHTML = state.user
        ? avatarMarkup(state.user, "sm") + '<span class="side-copy"><strong>@' + esc(state.user.username) + '</strong><span class="muted">' + esc(state.user.displayName || "") + '</span></span>'
        : "";
    }
    if (visible !== "profile") editing = false;
    if (visible !== "settings") settingsPane = "menu";
    const profileView = document.getElementById("profile-view");
    const profileForm = document.getElementById("profile-form");
    if (profileView && profileForm) {
      profileView.hidden = editing;
      profileForm.hidden = !editing;
    }
    if (state.user) {
      document.getElementById("me-avatar").innerHTML = avatarMarkup(state.user, "lg");
      const editAvatar = document.getElementById("edit-avatar");
      if (editAvatar) editAvatar.innerHTML = avatarMarkup(state.user, "lg");
      const meName = document.getElementById("me-name");
      if (meName) meName.textContent = state.user.displayName || state.user.username;
      document.getElementById("me-line").textContent = "@" + state.user.username + " · " + (state.user.accountType === "PRIVATE" ? "Private" : "Public");
      const meBio = document.getElementById("me-bio");
      if (meBio) meBio.textContent = state.user.bio || "";
      const usernameLine = document.getElementById("username-line");
      if (usernameLine) usernameLine.textContent = "@" + state.user.username + (state.user.email ? " · " + state.user.email : "");
      const accountUsername = document.getElementById("account-username");
      const accountEmail = document.getElementById("account-email");
      if (accountUsername) accountUsername.textContent = "@" + state.user.username;
      if (accountEmail) accountEmail.textContent = state.user.email || "";
      const form = document.getElementById("profile-form");
      if (!(document.activeElement && form.contains(document.activeElement))) {
        form.displayName.value = state.user.displayName || "";
        form.bio.value = state.user.bio || "";
        form.accountType.value = state.user.accountType || "PUBLIC";
      }
      const privacy = state.user.accountType === "PRIVATE" ? "privacy-private" : "privacy-public";
      const privacyInput = document.getElementById(privacy);
      if (privacyInput instanceof HTMLInputElement && document.activeElement !== privacyInput) privacyInput.checked = true;
    }
    ["menu", "account", "privacy", "notifications", "security", "about"].forEach((pane) => {
      const panel = document.getElementById("settings-" + pane);
      if (panel) panel.hidden = settingsPane !== pane;
    });
    const toggle = (id, on) => {
      const button = document.getElementById(id);
      if (button) button.setAttribute("aria-pressed", on ? "true" : "false");
    };
    toggle("notify-messages", state.notifyMessages !== false);
    toggle("notify-requests", state.notifyFriendRequests !== false);
    toggle("notify-accepted", state.notifyFriendAccepted !== false);
    toggle("activity-status", !state.user || state.user.showActivityStatus !== false);
    const selected = state.selectedUser;
    document.getElementById("user-avatar").innerHTML = selected ? avatarMarkup(selected, "lg") : "";
    document.getElementById("user-name").textContent = selected ? (selected.displayName || selected.username) : "Profile";
    const selectedActivity = selected ? presenceText(presenceFor(selected.id, selected)) : "";
    document.getElementById("user-meta").textContent = selected ? ("@" + selected.username + (selectedActivity ? " · " + selectedActivity : "")) : "";
    const blocked = selected && selected.relationship === "BLOCKED";
    const friends = selected && selected.relationship === "FRIENDS";
    const privateLocked = selected && selected.accountType === "PRIVATE" && !friends && !blocked;
    document.getElementById("user-bio").textContent = !selected ? "" : blocked ? "You blocked this account." : privateLocked ? "This account is private. Connect to see more." : (selected.bio || "");
    document.getElementById("user-actions").innerHTML = !selected ? "" : blocked
      ? '<button class="btn" data-act="unblock" data-id="' + esc(selected.id) + '" data-name="' + esc(selected.username) + '">Unblock</button>'
      : (selected.relationship === "NONE" ? '<button class="btn primary" data-act="friend" data-id="' + esc(selected.id) + '">Send request</button>' : "")
        + (selected.relationship === "OUTGOING_REQUEST" ? '<span class="muted">Request sent</span>' : "")
        + (selected.relationship === "INCOMING_REQUEST" ? '<span class="muted">Request received</span>' : "")
        + (friends ? '<button class="btn" data-act="message" data-id="' + esc(selected.id) + '">Message</button><button class="btn" data-act="unfriend" data-id="' + esc(selected.id) + '">Remove friend</button>' : "")
        + '<button class="btn" data-act="block" data-id="' + esc(selected.id) + '">Block</button>';
    const blockedList = document.getElementById("blocked-list");
    if (blockedList) {
      blockedList.innerHTML = (state.blockedUsers || []).length ? state.blockedUsers.map((user) =>
        userRow(user, '<button class="btn" data-act="unblock" data-id="' + esc(user.id) + '" data-name="' + esc(user.username) + '">Unblock</button>')
      ).join("") : emptyState("No blocked accounts", "People you block are listed here.", "");
    }
    const composer = document.getElementById("message-form");
    const composerBox = composer ? composer.querySelector("textarea") : null;
    const sendBtn = document.getElementById("send-btn");
    if (sendBtn) {
      const empty = !(composerBox instanceof HTMLTextAreaElement) || !composerBox.value.trim();
      sendBtn.disabled = !!state.busy || empty || lock !== "none";
      sendBtn.textContent = state.busy && inThread ? "…" : "➤";
      sendBtn.setAttribute("aria-label", state.busy && inThread ? "Sending" : "Send");
    }
    if (composerBox instanceof HTMLTextAreaElement) composerBox.disabled = !!state.busy || lock !== "none";
    document.getElementById("device-list").innerHTML = (state.devices || []).length ? state.devices.map((d) =>
      '<div class="card"><strong>' + esc(d.deviceName || d.id) + '</strong><span class="muted">' + esc(d.platform || "") + '</span><button class="btn" data-act="revoke" data-id="' + esc(d.id) + '">Revoke</button></div>'
    ).join("") : '<p class="muted">No devices listed.</p>';
    document.querySelectorAll("button, input, textarea, select").forEach((el) => {
      if (el.id === "back-btn" || el.id === "thread-back" || el.id === "thread-profile" || el.id === "send-btn" || el.id === "chat-filter" || el.id === "jump-latest" || el.id === "retry" || el.id === "dialog-ok" || el.id === "dialog-cancel" || el.id === "edit-profile" || el.id === "close-edit" || el.hasAttribute("data-go") || el.hasAttribute("data-toggle") || el.hasAttribute("data-settings") || el.hasAttribute("data-friend-tab") || el.classList.contains("toggle")) return;
      el.disabled = !!state.busy;
    });
  }
  function ask(text, okLabel, action) {
    dialogAction = action;
    document.getElementById("dialog-text").textContent = text;
    document.getElementById("dialog-ok").textContent = okLabel;
    document.getElementById("dialog").hidden = false;
    document.getElementById("dialog-ok").focus();
  }
  function closeDialog() {
    dialogAction = null;
    document.getElementById("dialog").hidden = true;
  }
  document.body.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement ? event.target.closest("button, [data-toggle]") : null;
    if (!(target instanceof HTMLElement)) return;
    if (target.hasAttribute("data-settings")) {
      settingsPane = target.getAttribute("data-settings") || "menu";
      apply(state);
      return;
    }
    if (target.hasAttribute("data-friend-tab")) {
      friendTab = target.getAttribute("data-friend-tab") || "friends";
      apply(state);
      return;
    }
    if (target.hasAttribute("data-toggle")) {
      const input = target.parentElement && target.parentElement.querySelector("input");
      if (input instanceof HTMLInputElement) {
        input.type = input.type === "password" ? "text" : "password";
        target.textContent = input.type === "password" ? "Show" : "Hide";
      }
      return;
    }
    const go = target.getAttribute("data-go");
    if (go) { vscode.postMessage({ version: 1, type: "navigate", destination: go }); return; }
    const act = target.getAttribute("data-act");
    const id = target.getAttribute("data-id");
    if (!act || !id || state.busy) return;
    if (act === "open-user") vscode.postMessage({ version: 1, type: "openUser", userId: id });
    if (act === "friend") vscode.postMessage({ version: 1, type: "sendFriendRequest", userId: id });
    if (act === "accept") vscode.postMessage({ version: 1, type: "acceptFriendRequest", requestId: id });
    if (act === "reject") vscode.postMessage({ version: 1, type: "rejectFriendRequest", requestId: id });
    if (act === "unfriend") vscode.postMessage({ version: 1, type: "removeFriend", userId: id });
    if (act === "block") vscode.postMessage({ version: 1, type: "blockUser", userId: id });
    if (act === "unblock") {
      const name = target.getAttribute("data-name") || "this account";
      ask("Unblock @" + name + "?", "Unblock", () => vscode.postMessage({ version: 1, type: "unblockUser", userId: id }));
    }
    if (act === "message") vscode.postMessage({ version: 1, type: "openConversation", participantId: id });
    if (act === "open-chat") vscode.postMessage({ version: 1, type: "openConversation", conversationId: id });
    if (act === "open-note") vscode.postMessage({ version: 1, type: "openNotification", notificationId: id });
    if (act === "revoke") vscode.postMessage({ version: 1, type: "revokeDevice", deviceId: id });
    if (act === "retry-message") {
      const text = target.getAttribute("data-text") || "";
      if (state.activeConversationId && text.trim()) vscode.postMessage({ version: 1, type: "sendMessage", conversationId: state.activeConversationId, text });
    }
  });
  document.getElementById("back-btn").addEventListener("click", () => {
    if (state.screen === "messages" && state.activeConversationId) {
      vscode.postMessage({ version: 1, type: "closeThread" });
      return;
    }
    vscode.postMessage({ version: 1, type: "back" });
  });
  document.getElementById("thread-back").addEventListener("click", () => vscode.postMessage({ version: 1, type: "closeThread" }));
  document.getElementById("login-form").addEventListener("submit", (e) => { e.preventDefault(); const d = new FormData(e.target); vscode.postMessage({ version: 1, type: "login", usernameOrEmail: String(d.get("usernameOrEmail")||""), password: String(d.get("password")||"") }); });
  document.getElementById("signup-form").addEventListener("submit", (e) => { e.preventDefault(); const d = new FormData(e.target); vscode.postMessage({ version: 1, type: "signup", username: String(d.get("username")||""), email: String(d.get("email")||""), displayName: String(d.get("displayName")||""), password: String(d.get("password")||"") }); });
  document.getElementById("forgot-form").addEventListener("submit", (e) => { e.preventDefault(); const d = new FormData(e.target); vscode.postMessage({ version: 1, type: "forgotPassword", email: String(d.get("email")||"") }); });
  document.getElementById("reset-form").addEventListener("submit", (e) => { e.preventDefault(); const d = new FormData(e.target); vscode.postMessage({ version: 1, type: "resetPassword", token: String(d.get("token")||""), newPassword: String(d.get("newPassword")||"") }); });
  document.getElementById("profile-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const d = new FormData(e.target);
    const accountType = String(d.get("accountType") || "PUBLIC");
    const displayName = String(d.get("displayName") || "").trim();
    if (!displayName) {
      document.getElementById("avatar-error").hidden = false;
      document.getElementById("avatar-error").textContent = "Display name is required.";
      return;
    }
    const send = () => vscode.postMessage({ version: 1, type: "updateProfile", displayName, bio: String(d.get("bio") || ""), accountType });
    if (state.user && state.user.accountType !== "PRIVATE" && accountType === "PRIVATE") {
      ask("Switch to private account? New people will need your approval before they can see more than your basic profile.", "Switch", send);
      return;
    }
    send();
  });
  document.getElementById("edit-profile").addEventListener("click", () => { editing = true; apply(state); });
  document.getElementById("close-edit").addEventListener("click", () => { editing = false; apply(state); });
  document.querySelectorAll('input[name="privacyMode"]').forEach((input) => {
    input.addEventListener("change", () => {
      if (!(input instanceof HTMLInputElement) || !input.checked || !state.user) return;
      const accountType = input.value === "PRIVATE" ? "PRIVATE" : "PUBLIC";
      const send = () => vscode.postMessage({ version: 1, type: "updateProfile", accountType });
      if (accountType === "PRIVATE" && state.user.accountType !== "PRIVATE") {
        ask("Switch to private account? New people will need your approval before they can see more than your basic profile.", "Switch", send);
        return;
      }
      send();
    });
  });
  document.getElementById("notify-messages").addEventListener("click", () => vscode.postMessage({ version: 1, type: "setNotify", key: "messages", enabled: state.notifyMessages === false }));
  document.getElementById("notify-requests").addEventListener("click", () => vscode.postMessage({ version: 1, type: "setNotify", key: "friendRequests", enabled: state.notifyFriendRequests === false }));
  document.getElementById("notify-accepted").addEventListener("click", () => vscode.postMessage({ version: 1, type: "setNotify", key: "friendAccepted", enabled: state.notifyFriendAccepted === false }));
  document.getElementById("activity-status").addEventListener("click", () => vscode.postMessage({ version: 1, type: "updateProfile", showActivityStatus: !(state.user && state.user.showActivityStatus !== false) }));
  document.getElementById("dialog-cancel").addEventListener("click", () => { closeDialog(); apply(state); });
  document.getElementById("dialog-ok").addEventListener("click", () => { const action = dialogAction; closeDialog(); if (action) action(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !document.getElementById("dialog").hidden) closeDialog(); });
  document.getElementById("remove-avatar").addEventListener("click", () => vscode.postMessage({ version: 1, type: "removeAvatar" }));
  document.getElementById("avatar-file").addEventListener("change", (event) => {
    const input = event.target;
    const file = input instanceof HTMLInputElement && input.files ? input.files[0] : undefined;
    if (input instanceof HTMLInputElement) input.value = "";
    if (!file) return;
    const avatarError = document.getElementById("avatar-error");
    if (file.type !== "image/jpeg" && file.type !== "image/png" && file.type !== "image/webp") {
      avatarError.hidden = false;
      avatarError.textContent = "This image format isn't supported.";
      return;
    }
    if (file.size > 2097152) {
      avatarError.hidden = false;
      avatarError.textContent = "Profile picture is too large.";
      return;
    }
    avatarError.hidden = true;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const data = result.split(",")[1] || "";
      if (!data) return;
      vscode.postMessage({ version: 1, type: "uploadAvatar", contentType: file.type, dataBase64: data });
    };
    reader.readAsDataURL(file);
  });
  document.getElementById("password-form").addEventListener("submit", (e) => { e.preventDefault(); const d = new FormData(e.target); vscode.postMessage({ version: 1, type: "changePassword", currentPassword: String(d.get("currentPassword")||""), newPassword: String(d.get("newPassword")||"") }); e.target.reset(); });
  document.getElementById("message-form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!state.activeConversationId || state.busy) return;
    const box = e.target.querySelector("textarea");
    const text = box instanceof HTMLTextAreaElement ? box.value.trim() : "";
    if (!text) return;
    vscode.postMessage({ version: 1, type: "sendMessage", conversationId: state.activeConversationId, text });
    if (typingOn) {
      typingOn = false;
      window.clearTimeout(typingStopTimer);
      vscode.postMessage({ version: 1, type: "typing", conversationId: state.activeConversationId, active: false });
    }
    e.target.reset();
    const send = document.getElementById("send-btn");
    if (send) send.disabled = true;
  });
  document.querySelector("#message-form textarea").addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    document.getElementById("message-form").requestSubmit();
  });
  document.querySelector("#message-form textarea").addEventListener("input", (event) => {
    const send = document.getElementById("send-btn");
    const box = event.target;
    if (send && box instanceof HTMLTextAreaElement) send.disabled = !box.value.trim() || state.busy;
    if (!(box instanceof HTMLTextAreaElement) || !state.activeConversationId) return;
    const decision = typingCommand(typingOn, box.value);
    typingOn = decision.typingOn;
    if (decision.active !== null) {
      vscode.postMessage({ version: 1, type: "typing", conversationId: state.activeConversationId, active: decision.active });
    }
    window.clearTimeout(typingStopTimer);
    if (decision.armIdle) {
      typingStopTimer = window.setTimeout(() => {
        typingOn = false;
        vscode.postMessage({ version: 1, type: "typing", conversationId: state.activeConversationId, active: false });
      }, TYPING_IDLE_MS);
    }
  });
  document.getElementById("chat-filter").addEventListener("input", (event) => {
    chatQuery = event.target instanceof HTMLInputElement ? event.target.value : "";
    apply(state);
  });
  document.getElementById("search-form").addEventListener("submit", (event) => event.preventDefault());
  document.getElementById("search-query").addEventListener("input", (event) => {
    const query = event.target instanceof HTMLInputElement ? event.target.value.trim() : "";
    window.clearTimeout(searchTimer);
    const status = document.getElementById("search-status");
    if (query.length < 2) { status.hidden = true; return; }
    status.hidden = false;
    searchTimer = window.setTimeout(() => {
      vscode.postMessage({ version: 1, type: "searchUsers", query });
    }, 300);
  });
  document.getElementById("jump-latest").addEventListener("click", () => {
    const list = document.getElementById("message-list");
    list.scrollTop = list.scrollHeight;
    heldNew = 0;
    document.getElementById("jump-latest").hidden = true;
  });
  document.getElementById("retry").addEventListener("click", () => vscode.postMessage({ version: 1, type: "retry" }));
  document.getElementById("read-all").addEventListener("click", () => vscode.postMessage({ version: 1, type: "markAllNotificationsRead" }));
  document.getElementById("resend-verify").addEventListener("click", () => vscode.postMessage({ version: 1, type: "resendVerification" }));
  document.getElementById("logout-btn").addEventListener("click", () => vscode.postMessage({ version: 1, type: "logout" }));
  window.addEventListener("message", (event) => { if (isState(event.data)) apply(event.data); });
  apply(state);
        vscode.postMessage({ version: 1, type: "ready" });
      })();
    </script>
  </body>
</html>`;
}

export function createStateMessage(state: HostState): HostMessage {
  return {
    version: 1,
    type: "state",
    phase: state.phase,
    screen: state.screen,
    canGoBack: state.canGoBack,
    authenticated: state.authenticated,
    insecureHttp: state.insecureHttp,
    e2eeEnabled: state.e2eeEnabled,
    user: state.user,
    selectedUser: state.selectedUser,
    error: state.error,
    notice: state.notice,
    busy: state.busy,
    searchResults: [...state.searchResults],
    friends: [...state.friends],
    incomingRequests: [...state.incomingRequests],
    outgoingRequests: [...state.outgoingRequests],
    conversations: [...state.conversations],
    activeConversationId: state.activeConversationId,
    messages: state.messages.map((message) => ({ ...message })),
    notifications: [...state.notifications],
    unreadNotifications: state.unreadNotifications,
    unreadMessages: state.unreadMessages,
    connection: state.connection,
    toast: state.toast,
    toastSeq: state.toastSeq,
    devices: [...state.devices],
    blockedUsers: [...(state.blockedUsers || [])],
    avatars: { ...(state.avatars || {}) },
    messageLock: state.messageLock || "none",
    notifyMessages: state.notifyMessages !== false,
    notifyFriendRequests: state.notifyFriendRequests !== false,
    notifyFriendAccepted: state.notifyFriendAccepted !== false,
    friendsPanel: state.friendsPanel || "friends",
    friendsPanelSeq: state.friendsPanelSeq || 0,
    unreadByConversation: { ...(state.unreadByConversation || {}) },
    conversationPreviews: { ...(state.conversationPreviews || {}) },
    presenceByUser: { ...(state.presenceByUser || {}) },
    typing: state.typing ?? null,
  };
}
