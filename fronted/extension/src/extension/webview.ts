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
  };
}

export function renderWebview(webview: Webview, state: HostState): string {
  const nonce = randomBytes(18).toString("base64");
  const initialState = JSON.stringify(state).replace(/</g, "\\u003c");
  const csp = [
    "default-src 'none'",
    `style-src 'nonce-${nonce}'`,
    `script-src 'nonce-${nonce}'`,
    `img-src ${webview.cspSource}`,
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
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; color: var(--vscode-foreground); background: var(--vscode-sideBar-background); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); }
  button, input, textarea, select { font: inherit; color: inherit; }
  button { cursor: pointer; }
  button:disabled, input:disabled, textarea:disabled { opacity: .6; cursor: default; }
  button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
  [hidden] { display: none !important; }
  @media (forced-colors: active) {
    .mark, .card, .btn, .banner, .msg { border: 1px solid CanvasText; forced-color-adjust: auto; }
    .btn.primary { background: Highlight; color: HighlightText; }
    .banner.error { color: CanvasText; }
  }
  .app { min-height: 100vh; display: flex; flex-direction: column; }
  .top { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--vscode-panel-border); }
  .mark { width: 28px; height: 28px; display: grid; place-items: center; border: 1px solid var(--vscode-focusBorder); border-radius: 6px; color: var(--vscode-focusBorder); font-weight: 700; }
  .brand { font-weight: 650; }
  .back, .nav-btn, .btn { min-height: 28px; border: 1px solid var(--vscode-panel-border); border-radius: 4px; background: transparent; padding: 0 8px; }
  .btn.primary { border-color: transparent; background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  nav { display: flex; gap: 4px; overflow-x: auto; padding: 8px; border-bottom: 1px solid var(--vscode-panel-border); }
  .nav-btn[aria-current="page"] { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); border-color: transparent; }
  main { padding: 12px; display: grid; gap: 10px; }
  h1 { margin: 0; font-size: 18px; font-weight: 640; }
  p { margin: 0; }
  .muted { color: var(--vscode-descriptionForeground); font-size: 12px; line-height: 1.45; }
  .stack { display: grid; gap: 8px; }
  .row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  label { display: grid; gap: 4px; font-size: 11px; color: var(--vscode-descriptionForeground); }
  input, textarea, select { width: 100%; min-height: 28px; padding: 4px 8px; border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius: 3px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); }
  textarea { min-height: 64px; resize: vertical; }
  .card { display: grid; gap: 4px; padding: 8px; border: 1px solid var(--vscode-panel-border); border-radius: 4px; background: var(--vscode-editor-background); }
  .banner { padding: 8px; border-radius: 4px; font-size: 12px; }
  .banner.error { color: var(--vscode-errorForeground); background: color-mix(in srgb, var(--vscode-errorForeground) 12%, transparent); }
  .banner.notice { background: color-mix(in srgb, var(--vscode-focusBorder) 14%, transparent); }
  .msg { padding: 7px 8px; border-radius: 4px; background: color-mix(in srgb, var(--vscode-focusBorder) 12%, transparent); white-space: pre-wrap; word-break: break-word; }
  .msg.mine { background: color-mix(in srgb, var(--vscode-button-background) 24%, transparent); }
  .splash { min-height: 70vh; display: grid; place-items: center; text-align: center; gap: 8px; }
  .spinner { width: 28px; height: 28px; margin: 8px auto 0; border: 2px solid var(--vscode-panel-border); border-top-color: var(--vscode-focusBorder); border-radius: 50%; }
  @media (prefers-reduced-motion: no-preference) {
    .spinner { animation: spin 800ms linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  }
  .badge { min-width: 16px; padding: 0 4px; border-radius: 8px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); font-size: 10px; }
  .linkish { background: none; border: 0; padding: 0; color: var(--vscode-textLink-foreground); text-align: left; }
  .toast { position: sticky; bottom: 8px; margin: 8px 12px; padding: 8px 10px; border-radius: 6px; background: var(--vscode-notifications-background, var(--vscode-editorWidget-background)); color: var(--vscode-notifications-foreground, var(--vscode-foreground)); border: 1px solid var(--vscode-notifications-border, var(--vscode-panel-border)); }
  .status { margin-left: auto; font-size: 11px; color: var(--vscode-descriptionForeground); }
  #message-list { max-height: 280px; overflow: auto; display: flex; flex-direction: column; gap: 6px; }
  .msg.mine { margin-left: 18%; }
  .msg.theirs { margin-right: 18%; }
  .skel { height: 12px; border-radius: 4px; background: color-mix(in srgb, var(--vscode-descriptionForeground) 25%, transparent); }
</style>
</head>
<body>
<div class="app">
  <header class="top">
    <button class="back" id="back-btn" type="button" hidden>Back</button>
    <div class="mark" aria-hidden="true">d</div>
    <div class="brand">DevConnect</div>
    <span class="status" id="live-status" hidden>Reconnecting…</span>
  </header>
  <nav id="app-nav" aria-label="DevConnect" hidden>
    <button class="nav-btn" type="button" data-go="home">Home</button>
    <button class="nav-btn" type="button" data-go="search">Search</button>
    <button class="nav-btn" type="button" data-go="friends">Friends<span class="badge" id="friend-badge" hidden>0</span></button>
    <button class="nav-btn" type="button" data-go="messages">Messages<span class="badge" id="message-badge" hidden>0</span></button>
    <button class="nav-btn" type="button" data-go="notifications">Alerts<span class="badge" id="badge" hidden>0</span></button>
    <button class="nav-btn" type="button" data-go="profile">Profile</button>
    <button class="nav-btn" type="button" data-go="settings">Settings</button>
  </nav>
  <main>
    <p class="banner error" id="error" hidden></p>
    <p class="banner notice" id="notice" hidden></p>

    <section data-screen="splash" class="splash">
      <div>
        <div class="mark" aria-hidden="true">d</div>
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
      <div class="card" id="home-activity"></div>
      <div class="row">
        <button class="btn" type="button" data-go="search">Search</button>
        <button class="btn" type="button" data-go="friends">Friends</button>
        <button class="btn" type="button" data-go="messages">Messages</button>
        <button class="btn" type="button" data-go="notifications">Notifications</button>
        <button class="btn" type="button" data-go="profile">Profile</button>
        <button class="btn" type="button" data-go="settings">Settings</button>
      </div>
    </section>

    <section data-screen="search" class="stack" hidden>
      <h1>Search</h1>
      <form id="search-form" class="stack">
        <label>Find people<input id="search-query" name="query" maxlength="80" placeholder="Name or username"></label>
        <p class="muted" id="search-status" hidden>Searching…</p>
      </form>
      <div id="search-list" class="stack"></div>
    </section>

    <section data-screen="user" class="stack" hidden>
      <h1 id="user-name">Profile</h1>
      <p class="muted" id="user-meta"></p>
      <p class="muted" id="user-bio"></p>
      <div class="row" id="user-actions"></div>
    </section>

    <section data-screen="friends" class="stack" hidden>
      <h1>Friends</h1>
      <button class="btn" type="button" id="reload-social">Refresh</button>
      <p class="muted">Incoming requests</p>
      <div id="incoming-list" class="stack"></div>
      <p class="muted">Friends</p>
      <div id="friends-list" class="stack"></div>
      <p class="muted">Outgoing</p>
      <div id="outgoing-list" class="stack"></div>
    </section>

    <section data-screen="messages" class="stack" hidden>
      <h1>Messages</h1>
      <p class="muted" id="crypto-note"></p>
      <div id="chat-list" class="stack"></div>
      <div id="thread" class="stack" hidden>
        <p class="muted" id="thread-title"></p>
        <div id="message-list"></div>
        <button class="btn" type="button" id="jump-latest" hidden>New messages</button>
        <form id="message-form" class="stack">
          <label>Message<textarea name="text" required maxlength="4000"></textarea></label>
          <button class="btn primary" type="submit">Send</button>
        </form>
      </div>
    </section>

    <section data-screen="notifications" class="stack" hidden>
      <h1>Notifications</h1>
      <div class="row">
        <button class="btn" type="button" id="reload-notes">Refresh</button>
        <button class="btn" type="button" id="read-all">Mark all read</button>
      </div>
      <div id="note-list" class="stack"></div>
    </section>

    <section data-screen="profile" class="stack" hidden>
      <h1>My profile</h1>
      <p class="muted" id="me-line"></p>
      <form id="profile-form" class="stack">
        <label>Display name<input name="displayName" required maxlength="50"></label>
        <label>Bio<textarea name="bio" maxlength="500"></textarea></label>
        <label>Privacy<select name="accountType"><option value="PUBLIC">PUBLIC</option><option value="PRIVATE">PRIVATE</option></select></label>
        <button class="btn primary" type="submit">Save profile</button>
      </form>
      <button class="btn" type="button" id="reload-me">Reload</button>
      <button class="btn" type="button" id="resend-verify">Resend verification email</button>
    </section>

    <section data-screen="settings" class="stack" hidden>
      <h1>Settings</h1>
      <p class="muted">Account, privacy, security, and devices.</p>
      <button class="btn" type="button" data-go="profile">Edit profile and privacy</button>
      <form id="password-form" class="stack">
        <p class="muted">Security · change password signs you out on every device.</p>
        <label>Current password<input name="currentPassword" type="password" required maxlength="128"></label>
        <label>New password<input name="newPassword" type="password" required minlength="10" maxlength="128"></label>
        <button class="btn primary" type="submit">Change password</button>
      </form>
      <p class="muted">Devices</p>
      <button class="btn" type="button" id="reload-devices">Refresh devices</button>
      <div id="device-list" class="stack"></div>
      <button class="btn" type="button" id="logout-btn">Log out</button>
    </section>
  </main>
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

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" })[ch]);
  }
  function isState(value) {
    return value && value.version === 1 && value.type === "state" && screens.includes(value.screen) && typeof value.e2eeEnabled === "boolean";
  }
  function people(target, items, empty) {
    target.innerHTML = items.length ? items.map((p) =>
      '<div class="card"><strong>' + esc(p.displayName) + '</strong><span class="muted">@' + esc(p.username) + (p.relationship ? " · " + esc(p.relationship) : "") + '</span><div class="row">'
      + '<button class="btn" data-act="open-user" data-id="' + esc(p.id) + '">Profile</button>'
      + (p.relationship === "FRIENDS" ? '<button class="btn" data-act="message" data-id="' + esc(p.id) + '">Message</button>' : "")
      + (p.relationship === "NONE" || !p.relationship ? '<button class="btn" data-act="friend" data-id="' + esc(p.id) + '">Add friend</button>' : "")
      + '</div></div>'
    ).join("") : '<p class="muted">' + empty + '</p>';
  }
  function apply(next) {
    state = next;
    const visible = state.phase === "checking" ? "splash" : state.screen;
    document.querySelectorAll("[data-screen]").forEach((el) => { el.hidden = el.getAttribute("data-screen") !== visible; });
    document.getElementById("app-nav").hidden = !(state.authenticated && state.phase === "ready");
    document.getElementById("back-btn").hidden = !state.canGoBack || state.phase === "checking";
    document.querySelectorAll(".nav-btn").forEach((btn) => {
      if (btn.getAttribute("data-go") === state.screen) btn.setAttribute("aria-current", "page");
      else btn.removeAttribute("aria-current");
    });
    const error = document.getElementById("error");
    const notice = document.getElementById("notice");
    error.hidden = !state.error; error.textContent = state.error || "";
    notice.hidden = !state.notice; notice.textContent = state.notice || "";
    const badge = document.getElementById("badge");
    badge.hidden = !(state.unreadNotifications > 0);
    badge.textContent = String(state.unreadNotifications || 0);
    const friendBadge = document.getElementById("friend-badge");
    const requestCount = (state.incomingRequests || []).length;
    friendBadge.hidden = requestCount < 1;
    friendBadge.textContent = String(requestCount);
    const messageBadge = document.getElementById("message-badge");
    messageBadge.hidden = !(state.unreadMessages > 0);
    messageBadge.textContent = String(state.unreadMessages || 0);
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
    document.getElementById("home-title").textContent = state.user ? ("Hello, " + (state.user.displayName || state.user.username)) : "Home";
    document.getElementById("home-copy").textContent = state.user ? ("@" + state.user.username) : "";
    document.getElementById("home-activity").textContent = state.user
      ? ((state.incomingRequests || []).length + " friend request(s) · " + (state.unreadMessages || 0) + " new message(s) · " + (state.unreadNotifications || 0) + " alert(s)")
      : "";
    people(document.getElementById("search-list"), state.searchResults || [], "No developers found. Try another name.");
    people(document.getElementById("friends-list"), state.friends || [], "No friends yet. Search for a developer to connect.");
    document.getElementById("incoming-list").innerHTML = (state.incomingRequests || []).length ? state.incomingRequests.map((r) =>
      '<div class="card"><strong>' + esc(r.counterpart && r.counterpart.displayName) + '</strong><div class="row"><button class="btn primary" data-act="accept" data-id="' + esc(r.id) + '">Accept</button><button class="btn" data-act="reject" data-id="' + esc(r.id) + '">Reject</button></div></div>'
    ).join("") : '<p class="muted">No incoming requests.</p>';
    document.getElementById("outgoing-list").innerHTML = (state.outgoingRequests || []).length ? state.outgoingRequests.map((r) =>
      '<div class="card"><strong>' + esc(r.counterpart && r.counterpart.displayName) + '</strong><span class="muted">' + esc(r.status) + '</span></div>'
    ).join("") : '<p class="muted">No outgoing requests.</p>';
    document.getElementById("chat-list").innerHTML = (state.conversations || []).length ? state.conversations.map((c) =>
      '<div class="card"><button class="linkish" data-act="open-chat" data-id="' + esc(c.id) + '">Conversation</button><span class="muted">' + esc((c.participantIds || []).filter((id) => !state.user || id !== state.user.id).join(", ") || "Direct message") + '</span></div>'
    ).join("") : '<p class="muted">No conversations yet. Message a friend to start one.</p>';
    const thread = document.getElementById("thread");
    thread.hidden = !state.activeConversationId || visible !== "messages";
    document.getElementById("thread-title").textContent = state.activeConversationId ? "Conversation" : "";
    const list = document.getElementById("message-list");
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 48;
    const ordered = (state.messages || []).slice().reverse();
    list.innerHTML = ordered.map((m) => {
      const mine = state.user && m.senderId === state.user.id;
      return '<div class="msg ' + (mine ? "mine" : "theirs") + '">' + esc(m.displayText) + '<div class="muted">' + esc(m.createdAt || "") + " · " + esc(m.status) + '</div></div>';
    }).join("") || '<p class="muted">No messages yet. Say hello.</p>';
    if (nearBottom || ordered.length < 2) list.scrollTop = list.scrollHeight;
    document.getElementById("jump-latest").hidden = nearBottom || !state.activeConversationId;
    document.getElementById("note-list").innerHTML = (state.notifications || []).length ? state.notifications.map((n) =>
      '<div class="card"><button class="btn" data-act="open-note" data-id="' + esc(n.id) + '">' + esc(n.message) + '</button><span class="muted">' + esc(n.type) + (n.read ? " · read" : " · unread") + '</span></div>'
    ).join("") : '<p class="muted">No notifications yet.</p>';
    if (state.user) {
      document.getElementById("me-line").textContent = "@" + state.user.username + (state.user.email ? " · " + state.user.email : "") + " · " + (state.user.accountType || "PUBLIC");
      const form = document.getElementById("profile-form");
      if (document.activeElement && form.contains(document.activeElement)) {
        /* keep in-progress edits */
      } else {
        form.displayName.value = state.user.displayName || "";
        form.bio.value = state.user.bio || "";
        form.accountType.value = state.user.accountType || "PUBLIC";
      }
    }
    const selected = state.selectedUser;
    document.getElementById("user-name").textContent = selected ? (selected.displayName || selected.username) : "Profile";
    document.getElementById("user-meta").textContent = selected ? ("@" + selected.username + " · " + (selected.accountType || "") + (selected.relationship ? " · " + selected.relationship : "") + (selected.limited ? " · limited" : "")) : "";
    document.getElementById("user-bio").textContent = selected && !selected.limited ? (selected.bio || "") : (selected && selected.limited ? "This account is private." : "");
    document.getElementById("user-actions").innerHTML = selected ? (
      (selected.relationship === "NONE" ? '<button class="btn" data-act="friend" data-id="' + esc(selected.id) + '">Add friend</button>' : "")
      + (selected.relationship === "FRIENDS" ? '<button class="btn" data-act="message" data-id="' + esc(selected.id) + '">Message</button><button class="btn" data-act="unfriend" data-id="' + esc(selected.id) + '">Remove friend</button>' : "")
      + (selected.relationship === "BLOCKED" ? '<button class="btn" data-act="unblock" data-id="' + esc(selected.id) + '">Unblock</button>' : '<button class="btn" data-act="block" data-id="' + esc(selected.id) + '">Block</button>')
    ) : "";
    document.getElementById("device-list").innerHTML = (state.devices || []).length ? state.devices.map((d) =>
      '<div class="card"><strong>' + esc(d.deviceName || d.id) + '</strong><span class="muted">' + esc(d.platform || "") + '</span><button class="btn" data-act="revoke" data-id="' + esc(d.id) + '">Revoke</button></div>'
    ).join("") : '<p class="muted">No devices listed.</p>';
    document.querySelectorAll("button, input, textarea, select").forEach((el) => {
      if (el.id === "back-btn" || el.hasAttribute("data-go") || el.hasAttribute("data-toggle")) return;
      el.disabled = !!state.busy;
    });
  }
  document.body.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
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
    if (act === "unblock") vscode.postMessage({ version: 1, type: "unblockUser", userId: id });
    if (act === "message") vscode.postMessage({ version: 1, type: "openConversation", participantId: id });
    if (act === "open-chat") vscode.postMessage({ version: 1, type: "openConversation", conversationId: id });
    if (act === "open-note") vscode.postMessage({ version: 1, type: "openNotification", notificationId: id });
    if (act === "revoke") vscode.postMessage({ version: 1, type: "revokeDevice", deviceId: id });
  });
  document.getElementById("back-btn").addEventListener("click", () => vscode.postMessage({ version: 1, type: "back" }));
  document.getElementById("login-form").addEventListener("submit", (e) => { e.preventDefault(); const d = new FormData(e.target); vscode.postMessage({ version: 1, type: "login", usernameOrEmail: String(d.get("usernameOrEmail")||""), password: String(d.get("password")||"") }); });
  document.getElementById("signup-form").addEventListener("submit", (e) => { e.preventDefault(); const d = new FormData(e.target); vscode.postMessage({ version: 1, type: "signup", username: String(d.get("username")||""), email: String(d.get("email")||""), displayName: String(d.get("displayName")||""), password: String(d.get("password")||"") }); });
  document.getElementById("forgot-form").addEventListener("submit", (e) => { e.preventDefault(); const d = new FormData(e.target); vscode.postMessage({ version: 1, type: "forgotPassword", email: String(d.get("email")||"") }); });
  document.getElementById("reset-form").addEventListener("submit", (e) => { e.preventDefault(); const d = new FormData(e.target); vscode.postMessage({ version: 1, type: "resetPassword", token: String(d.get("token")||""), newPassword: String(d.get("newPassword")||"") }); });
  document.getElementById("profile-form").addEventListener("submit", (e) => { e.preventDefault(); const d = new FormData(e.target); vscode.postMessage({ version: 1, type: "updateProfile", displayName: String(d.get("displayName")||""), bio: String(d.get("bio")||""), accountType: String(d.get("accountType")||"PUBLIC") }); });
  document.getElementById("password-form").addEventListener("submit", (e) => { e.preventDefault(); const d = new FormData(e.target); vscode.postMessage({ version: 1, type: "changePassword", currentPassword: String(d.get("currentPassword")||""), newPassword: String(d.get("newPassword")||"") }); e.target.reset(); });
  document.getElementById("message-form").addEventListener("submit", (e) => { e.preventDefault(); if (!state.activeConversationId) return; const d = new FormData(e.target); vscode.postMessage({ version: 1, type: "sendMessage", conversationId: state.activeConversationId, text: String(d.get("text")||"") }); e.target.reset(); });
  document.getElementById("search-form").addEventListener("submit", (event) => event.preventDefault());
  document.getElementById("search-query").addEventListener("input", (event) => {
    const query = event.target instanceof HTMLInputElement ? event.target.value.trim() : "";
    window.clearTimeout(searchTimer);
    const status = document.getElementById("search-status");
    if (query.length < 2) { status.hidden = true; return; }
    status.hidden = false;
    searchTimer = window.setTimeout(() => {
      status.hidden = true;
      vscode.postMessage({ version: 1, type: "searchUsers", query });
    }, 300);
  });
  document.getElementById("jump-latest").addEventListener("click", () => {
    const list = document.getElementById("message-list");
    list.scrollTop = list.scrollHeight;
    document.getElementById("jump-latest").hidden = true;
  });
  document.getElementById("reload-social").addEventListener("click", () => vscode.postMessage({ version: 1, type: "loadSocial" }));
  document.getElementById("reload-notes").addEventListener("click", () => vscode.postMessage({ version: 1, type: "loadNotifications" }));
  document.getElementById("read-all").addEventListener("click", () => vscode.postMessage({ version: 1, type: "markAllNotificationsRead" }));
  document.getElementById("reload-me").addEventListener("click", () => vscode.postMessage({ version: 1, type: "refreshProfile" }));
  document.getElementById("resend-verify").addEventListener("click", () => vscode.postMessage({ version: 1, type: "resendVerification" }));
  document.getElementById("reload-devices").addEventListener("click", () => vscode.postMessage({ version: 1, type: "loadDevices" }));
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
  };
}
