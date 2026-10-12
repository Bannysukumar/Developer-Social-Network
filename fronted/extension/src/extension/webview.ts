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
import { chatActivity } from "./presence-state";
import { attachmentCaption, fileKind, fileTypeLabel } from "./attachment-layout";
import { EMOJI_CATEGORIES, GIFS, QUICK_REACTIONS, STICKERS } from "./media-catalog";
import { dateSeparatorLabel, shouldLoadOlderHistory } from "./date-label";
import { chatBlockMenuActionForState, chatMenuMarkup } from "./chat-menu";
import { documentEntries, escapeHtml, highlightMatch, mediaEntries, searchEntries, sortByTime, type LibraryEntry } from "./conversation-library";
import type { StoryCard, StoryRing, StoryViewer } from "../api/stories";
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
  readonly historyHasMore: boolean;
  readonly historyLoading: boolean;
  readonly historyError: string | null;
  readonly keyRecovery?: "ready" | "needed" | "unavailable";
  readonly historyClearedAt?: Readonly<Record<string, string>>;
  readonly threadPane?: "chat" | "search" | "media" | "docs";
  readonly libraryConversationId?: string | null;
  readonly libraryLoading?: boolean;
  readonly libraryError?: string | null;
  readonly libraryComplete?: boolean;
  readonly highlightMessageId?: string | null;
  readonly library?: readonly LibraryEntry[];
  readonly storiesLoading?: boolean;
  readonly storiesError?: string | null;
  readonly storyTray?: { mine: StoryCard[]; rings: StoryRing[] };
  readonly storyViewer?: { ownerId: string; storyId: string } | null;
  readonly storyStage?: { storyId: string; mediaType: "IMAGE" | "VIDEO"; contentType: string; dataUrl: string; failed: boolean } | null;
  readonly storyViewers?: readonly StoryViewer[];
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
    historyHasMore: false,
    historyLoading: false,
    historyError: null,
    keyRecovery: "ready",
    historyClearedAt: {},
    threadPane: "chat",
    libraryConversationId: null,
    libraryLoading: false,
    libraryError: null,
    libraryComplete: true,
    highlightMessageId: null,
    library: [],
    storiesLoading: false,
    storiesError: null,
    storyTray: { mine: [], rings: [] },
    storyViewer: null,
    storyStage: null,
    storyViewers: [],
  };
}

export function renderWebview(webview: Webview, state: HostState): string {
  const nonce = randomBytes(18).toString("base64");
  const initialState = JSON.stringify(state).replace(/</g, "\\u003c");
  const csp = [
    "default-src 'none'",
    `style-src 'nonce-${nonce}'`,
    `script-src 'nonce-${nonce}'`,
    `img-src ${webview.cspSource} data: blob:`,
    "media-src data: blob:",
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
  html, body { height: 100%; }
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
  .app { height: 100%; min-height: 100%; container-type: inline-size; }
  .shell { height: 100%; min-height: 100%; display: flex; }
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
  .stage { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; background: var(--vscode-editor-background); }
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
  main { padding: 4px 16px 20px; display: flex; flex-direction: column; gap: 12px; flex: 1; min-height: 0; overflow: auto; }
  section[data-screen="messages"]:not([hidden]) { flex: 1; min-height: 0; display: flex; flex-direction: column; justify-content: flex-start; overflow: hidden; }
  h1 { margin: 0; font-size: 18px; font-weight: 640; letter-spacing: -0.01em; }
  h2 { margin: 4px 0 0; font-size: 13px; font-weight: 640; }
  p { margin: 0; }
  .muted { color: var(--vscode-descriptionForeground); font-size: 12px; line-height: 1.45; }
  .stack { display: grid; gap: 8px; }
  section[data-screen="messages"]:not([hidden]) { display: flex; flex-direction: column; flex: 1; min-height: 0; height: 100%; overflow: hidden; }
  section[data-screen="messages"] #thread:not([hidden]) { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
  section[data-screen="messages"] #inbox { min-height: 0; overflow: auto; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  label { display: grid; gap: 4px; font-size: 12px; color: var(--vscode-descriptionForeground); }
  input, textarea, select { width: 100%; min-height: 32px; padding: 6px 8px; border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius: 6px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); }
  textarea { min-height: 72px; resize: vertical; }
  .search-field { position: relative; display: block; }
  .search-field .ico { position: absolute; left: 10px; top: 50%; width: 16px; height: 16px; margin-top: -8px; pointer-events: none; color: var(--vscode-descriptionForeground); }
  .search-field input { padding-left: 34px; }
  .card, .user-row, .setting-row { display: flex; gap: 10px; align-items: center; padding: 8px; border-radius: var(--dc-radius); }
  .user-row { width: 100%; text-align: left; background: transparent; border: 0; color: inherit; }
  .user-row:hover, .note:hover, .setting-row:hover { background: var(--vscode-list-hoverBackground); }
  .person-copy, .note-copy { display: grid; gap: 2px; min-width: 0; flex: 1; }
  .person-copy strong, .note-copy strong { font-size: 13px; font-weight: 600; }
  .banner { padding: 8px 10px; border-radius: 6px; font-size: 12px; }
  .banner.error { color: var(--vscode-errorForeground); background: color-mix(in srgb, var(--vscode-errorForeground) 12%, transparent); }
  .banner.notice { background: color-mix(in srgb, var(--vscode-focusBorder) 14%, transparent); }
  .msg { position: relative; max-width: 78%; align-self: flex-start; padding: 8px 10px; border-radius: 10px; background: color-mix(in srgb, var(--vscode-foreground) 8%, transparent); white-space: pre-wrap; word-break: break-word; box-sizing: border-box; }
  .msg.media { width: max-content; max-width: min(320px, 100%); padding: 4px; }
  .msg.media:has(.video-stage) { width: min(320px, 100%); }
  .msg.sealed { font-style: italic; opacity: 0.85; }
  .msg.deleted { font-style: italic; }
  .receipt { font-size: 11px; letter-spacing: -2px; opacity: .75; }
  .receipt.read { color: var(--vscode-textLink-foreground); opacity: 1; }
  .receipt.fail { color: var(--vscode-errorForeground); letter-spacing: 0; }
  .msg-menu { display: flex; gap: 4px; margin-top: 4px; flex-wrap: wrap; }
  @media (forced-colors: active) { .receipt.read { color: Highlight; } }
  .msg.mine { align-self: flex-end; margin-left: 0; background: color-mix(in srgb, var(--vscode-button-background) 28%, transparent); }
  .profile-head { display: grid; justify-items: center; text-align: center; gap: 4px; padding: 8px 0 4px; }
  .stats { display: flex; gap: 16px; justify-content: center; }
  .stats div { display: grid; justify-items: center; }
  .stats strong { font-size: 16px; }
  .tabs { display: flex; gap: 4px; }
  .tabs .btn[aria-selected="true"] { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); border-color: transparent; }
  .splash { min-height: 70vh; display: grid; place-items: center; text-align: center; gap: 8px; }
  .auth-screen { width: 100%; display: flex; justify-content: center; }
  .auth-layout { width: min(420px, 100%); }
  .auth-brand { display: none; }
  .auth-card { display: grid; gap: 14px; width: 100%; padding: 22px 20px 16px; border: 1px solid var(--vscode-panel-border); border-radius: 16px; background: color-mix(in srgb, var(--vscode-editor-background) 92%, var(--vscode-foreground) 8%); }
  .auth-logo { width: 44px; height: 44px; display: grid; place-items: center; border-radius: 12px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
  .auth-logo svg { width: 24px; height: 24px; display: block; }
  .auth-card h1 { font-size: 22px; }
  .auth-card form.stack { gap: 12px; }
  .auth-card input { min-height: 40px; padding: 8px 12px; border-radius: 10px; }
  .auth-card .btn.primary { width: 100%; min-height: 40px; border-radius: 10px; font-weight: 650; }
  .secret { position: relative; display: block; }
  .secret input { padding-right: 72px; }
  .secret .btn { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); min-height: 28px; }
  .auth-links { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .auth-foot { margin: 0; padding-top: 12px; border-top: 1px solid var(--vscode-panel-border); text-align: center; }
  .auth-foot .btn.quiet { display: inline; min-height: 0; padding: 0; vertical-align: baseline; }
  body.auth-view main { justify-content: center; }
  body.auth-view #error, body.auth-view #notice, body.auth-view #retry { width: min(420px, 100%); margin-inline: auto; }
  @supports (justify-content: safe center) { body.auth-view main { justify-content: safe center; } }
  @container (min-width: 760px) {
    .auth-layout { width: min(860px, 100%); display: grid; grid-template-columns: minmax(220px, 1fr) minmax(320px, 420px); align-items: center; gap: 36px; }
    .auth-brand { display: grid; gap: 10px; align-content: center; max-width: 340px; }
    .auth-brand h2 { margin: 0; font-size: 28px; font-weight: 650; }
    .auth-brand p { margin: 0; font-size: 14px; line-height: 1.5; }
  }
  .spinner { width: 28px; height: 28px; margin: 8px auto 0; border: 2px solid var(--vscode-panel-border); border-top-color: var(--vscode-focusBorder); border-radius: 50%; }
  @media (prefers-reduced-motion: no-preference) {
    .spinner { animation: spin 800ms linear infinite; }
    .typing i { animation: blink 1.2s infinite; }
    .typing i:nth-child(2) { animation-delay: .2s; }
    .typing i:nth-child(3) { animation-delay: .4s; }
    @keyframes blink { 50% { opacity: .2; } }
    .nav-btn, .attach-btn, .send-btn { transition: background 120ms linear, transform 80ms linear; }
    .attach-btn:active, .send-btn:active { transform: translateY(1px); }
    .image-bubble img { animation: image-in 160ms ease; }
    .motion.pulse i { animation: gif-pulse 1.1s ease-in-out infinite; }
    .motion.bounce i { animation: gif-bounce 1s ease-in-out infinite; }
    .motion.spin i { animation: spin 1.4s linear infinite; }
    .motion.slide i { animation: gif-slide 1.2s ease-in-out infinite; }
    @keyframes gif-pulse { 50% { transform: scale(1.35); } }
    @keyframes gif-bounce { 50% { transform: translateY(-16px); } }
    @keyframes gif-slide { 50% { transform: translateX(18px); } }
    .image-bubble.loading::after { animation: shimmer 1.2s ease-in-out infinite; }
    .upload-bar::before { animation: upload-slide 1s linear infinite; }
    .react-bar, .emoji-picker { transition: opacity 120ms linear; }
    @keyframes image-in { from { opacity: 0; } to { opacity: 1; } }
    @keyframes shimmer { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
    @keyframes upload-slide { from { transform: translateX(-120%); } to { transform: translateX(280%); } }
    @keyframes spin { to { transform: rotate(360deg); } }
  }
  .badge { min-width: 16px; height: 16px; padding: 0 4px; border-radius: 8px; display: inline-grid; place-items: center; background: var(--vscode-activityBarBadge-background, var(--vscode-badge-background)); color: var(--vscode-activityBarBadge-foreground, var(--vscode-badge-foreground)); font-size: 10px; }
  .person, .note, .setting-row { display: flex; gap: 10px; align-items: center; width: 100%; text-align: left; background: transparent; border: 0; border-radius: 8px; padding: 8px; color: inherit; }
  .note.unread { background: color-mix(in srgb, var(--vscode-list-inactiveSelectionBackground, var(--vscode-list-hoverBackground)) 80%, transparent); }
  .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; background: var(--vscode-activityBarBadge-background, var(--vscode-badge-background)); }
  .presence { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 4px; vertical-align: 1px; background: var(--vscode-disabledForeground); }
    .presence[data-state="online"] { background: var(--vscode-testing-iconPassed, var(--vscode-charts-green, var(--vscode-focusBorder))); }
    @media (forced-colors: active) {
      .presence { border: 1px solid CanvasText; }
      .presence[data-state="online"] { background: Highlight; }
    }
  .typing i { display: inline-block; width: 4px; height: 4px; margin-right: 3px; border-radius: 50%; background: var(--vscode-descriptionForeground); }
  .thread-head { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; min-height: 28px; }
  .thread-person { position: relative; display: flex; align-items: center; gap: 8px; min-width: 0; flex: 0 0 auto; }
  #thread-menu { margin-left: auto; }
  .note-actions { margin-left: auto; }
  .menu-pop { position: absolute; top: calc(100% + 4px); right: 0; z-index: 6; min-width: 168px; max-height: min(320px, 70vh); overflow: auto; display: grid; gap: 2px; padding: 6px; border-radius: 8px; background: var(--vscode-menu-background, var(--vscode-editorWidget-background)); color: var(--vscode-menu-foreground, var(--vscode-foreground)); border: 1px solid var(--vscode-menu-border, var(--vscode-panel-border)); box-shadow: 0 8px 24px color-mix(in srgb, var(--vscode-widget-shadow, #000) 28%, transparent); }
  .menu-pop .btn { display: flex; align-items: center; justify-content: flex-start; gap: 8px; }
  .menu-ico { width: 14px; height: 14px; flex: 0 0 auto; }
  #library { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 8px; }
  #library-body { flex: 1 1 auto; min-height: 0; overflow: auto; }
  .search-bar { display: flex; gap: 6px; align-items: center; }
  .search-bar input { flex: 1; min-width: 0; }
  .search-hit { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; text-align: left; }
  .search-hit mark { background: var(--vscode-editor-findMatchHighlightBackground, var(--vscode-editor-selectionBackground)); color: inherit; }
  .media-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 4px; overflow: auto; }
  .media-tile { aspect-ratio: 1; overflow: hidden; border: 0; padding: 0; border-radius: 6px; background: var(--vscode-editorWidget-background); color: var(--vscode-foreground); display: grid; place-items: center; }
  .media-tile img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .doc-row { display: flex; gap: 8px; align-items: center; text-align: left; min-width: 0; }
  .doc-row .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .msg.flash { outline: 2px solid var(--vscode-focusBorder); outline-offset: 2px; }
  .story-row { display: flex; align-items: center; gap: 4px; max-width: 100%; min-width: 0; }
  .story-scroller { flex: 1; min-width: 0; overflow-x: auto; overflow-y: hidden; scroll-behavior: smooth; }
  .story-items { display: flex; gap: 10px; width: max-content; padding: 4px 2px 8px; }
  .story-tile { width: 72px; border: 0; background: transparent; color: inherit; display: grid; justify-items: center; gap: 4px; padding: 0; }
  .story-ring { width: 56px; height: 56px; border-radius: 50%; padding: 2px; display: grid; place-items: center; }
  .story-ring.unseen { background: linear-gradient(135deg, #f9ce34, #ee2a7b 55%, #6228d7); }
  .story-ring.seen { background: var(--vscode-widget-border, var(--vscode-panel-border)); }
  .story-ring.mine { background: var(--vscode-button-background); }
  .story-avatar { width: 50px; height: 50px; border-radius: 50%; overflow: hidden; background: var(--vscode-editor-background); display: grid; place-items: center; position: relative; }
  .story-plus { position: absolute; right: -2px; bottom: -2px; width: 16px; height: 16px; border-radius: 50%; background: var(--vscode-button-background); color: var(--vscode-button-foreground); font-size: 12px; line-height: 16px; }
  .story-name { max-width: 72px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
  .story-skel { width: 56px; height: 56px; border-radius: 50%; background: var(--vscode-editorWidget-background); }
  .story-overlay { position: fixed; inset: 0; z-index: 20; background: color-mix(in srgb, #000 72%, transparent); display: flex; align-items: center; justify-content: center; padding: 12px; }
  .story-sheet { width: min(420px, 100%); max-height: 100%; overflow: auto; background: var(--vscode-editor-background); color: var(--vscode-foreground); border: 1px solid var(--vscode-panel-border); border-radius: 12px; padding: 12px; display: grid; gap: 8px; }
  .story-stage { width: min(320px, 100%); aspect-ratio: 9 / 16; max-height: 62vh; margin: 0 auto; overflow: hidden; border-radius: 10px; background: #111; display: grid; place-items: center; }
  .story-stage img, .story-stage video { max-width: 100%; max-height: 100%; object-fit: contain; }
  .story-progress { display: flex; gap: 3px; }
  .story-progress i { flex: 1; height: 2px; background: color-mix(in srgb, var(--vscode-foreground) 28%, transparent); }
  .story-progress i.on { background: var(--vscode-foreground); }
  .story-tile:focus-visible, .story-scroll:focus-visible, #story-close:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { .story-scroller { scroll-behavior: auto; } }
  .menu-pop .btn { width: 100%; justify-content: flex-start; text-align: left; }
  #thread-menu:focus-visible, #clear-notifications:focus-visible, .menu-pop .btn:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
  .dialog h2 { margin: 0 0 6px; font-size: 16px; font-weight: 600; }
  .thread-person strong, .thread-person span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .icon-btn { width: 28px; min-width: 28px; padding: 0; }
  #thread { flex: 1; min-height: 0; height: 100%; display: flex; flex-direction: column; justify-content: flex-start; gap: 8px; }
  .composer { display: flex; flex-direction: column; gap: 8px; flex: 0 0 auto; position: sticky; bottom: 0; padding: 8px 0; background: var(--vscode-editor-background); }
  .composer-row { display: flex; align-items: flex-end; gap: 8px; min-width: 0; }
  .composer-field { flex: 1; min-width: 0; }
  .composer textarea { min-height: 36px; max-height: 120px; resize: none; }
  .attach-wrap { position: relative; flex: none; z-index: 4; }
  .attach-btn, .send-btn { width: 36px; height: 36px; min-width: 36px; min-height: 36px; border-radius: 8px; padding: 0; display: inline-grid; place-items: center; }
  .attach-btn:hover { background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground)); }
  .attach-btn:focus-visible, .send-btn:focus-visible, .attach-menu .btn:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
  .attach-btn svg, .file-glyph { width: 18px; height: 18px; display: block; pointer-events: none; }
  .attach-menu { position: absolute; bottom: 42px; left: 0; z-index: 5; min-width: 196px; display: grid; gap: 2px; padding: 6px; border-radius: 8px; background: var(--vscode-menu-background, var(--vscode-editorWidget-background)); color: var(--vscode-menu-foreground, var(--vscode-foreground)); border: 1px solid var(--vscode-menu-border, var(--vscode-panel-border)); box-shadow: 0 8px 24px color-mix(in srgb, var(--vscode-widget-shadow, #000) 28%, transparent); }
  .attach-menu .btn { width: 100%; justify-content: flex-start; text-align: left; }
  .attach-panel { display: flex; gap: 8px; overflow-x: auto; padding: 8px; border: 1px solid var(--vscode-panel-border); border-radius: 10px; background: var(--vscode-input-background); }
  .attach-card { position: relative; flex: none; width: 112px; display: grid; gap: 4px; }
  .attach-card img, .attach-card .file-glyph-box { width: 112px; height: 84px; object-fit: contain; border-radius: 8px; background: color-mix(in srgb, var(--vscode-foreground) 6%, transparent); }
  .attach-card .file-glyph-box { display: grid; place-items: center; }
  .attach-card .name, .attach-card .size { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
  .attach-card .remove { position: absolute; top: 4px; right: 4px; width: 22px; height: 22px; min-width: 22px; padding: 0; border-radius: 11px; }
  .file-card { display: flex; gap: 8px; align-items: center; flex-wrap: nowrap; margin-top: 0; min-width: 0; width: max-content; max-width: min(280px, 100%); box-sizing: border-box; }
  .video-card { display: grid; gap: 6px; width: 100%; max-width: 100%; box-sizing: border-box; }
  .file-card span, .file-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .file-name { display: block; max-width: 160px; }
  .file-copy { display: grid; min-width: 0; }
  .video-stage { width: 100%; aspect-ratio: 16 / 9; max-height: 180px; display: grid; place-items: center; border-radius: 12px; background: color-mix(in srgb, var(--vscode-foreground) 10%, transparent); position: relative; }
  .video-stage video { width: 100%; height: 100%; object-fit: contain; border-radius: 12px; background: #000; }
  .video-play { width: 36px; height: 36px; min-width: 36px; padding: 0; border-radius: 18px; display: grid; place-items: center; border: 0; color: inherit; background: color-mix(in srgb, var(--vscode-editor-background) 72%, transparent); }
  .image-frame { position: relative; display: inline-block; max-width: 100%; }
  .image-bubble { display: block; padding: 0; border: 0; background: transparent; max-width: 100%; }
  .image-bubble img { display: block; max-width: min(320px, 100%); max-height: 240px; width: auto; height: auto; object-fit: contain; border-radius: 12px; background: var(--vscode-input-background); }
  .msg-caption { margin-top: 4px; white-space: pre-wrap; word-break: break-word; }
  .sticker-bubble { width: 128px; height: 128px; padding: 0; border: 0; background: transparent; }
  .sticker-bubble svg { width: 128px; height: 128px; display: block; }
  .motion { width: min(200px, 100%); height: 112px; border-radius: 12px; display: grid; place-items: center; overflow: hidden; background: color-mix(in srgb, var(--vscode-foreground) 10%, transparent); }
  .motion i { width: 28px; height: 28px; border-radius: 50%; background: var(--vscode-button-background); display: block; }
  .motion.bounce i { border-radius: 8px; }
  .motion.spin i { border-radius: 4px; }
  .motion.slide i { width: 36px; height: 18px; border-radius: 9px; }
  .react-row { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; max-width: 100%; }
  .react-chip { min-height: 22px; padding: 0 6px; border-radius: 11px; font-size: 12px; }
  .react-chip.mine { border-color: var(--vscode-focusBorder); background: color-mix(in srgb, var(--vscode-focusBorder) 18%, transparent); }
  .react-bar { display: none; position: absolute; top: 0; left: calc(100% + 6px); z-index: 6; flex-direction: row; gap: 2px; padding: 3px; border-radius: 16px; border: 1px solid var(--vscode-panel-border); background: var(--vscode-editorWidget-background, var(--vscode-editor-background)); }
  .msg.mine .react-bar { left: auto; right: calc(100% + 6px); }
  .msg:hover .react-bar, .msg:focus-within .react-bar, .msg.react-open .react-bar { display: flex; }
  .react-bar .btn { width: 28px; min-width: 28px; height: 28px; min-height: 28px; padding: 0; border-radius: 14px; }
  @container (max-width: 560px) {
    .react-bar, .msg.mine .react-bar { top: auto; bottom: calc(100% + 4px); left: 0; right: auto; }
    .msg.mine .react-bar { left: auto; right: 0; }
  }
  .emoji-picker { position: fixed; z-index: 40; width: min(280px, calc(100vw - 16px)); max-height: 240px; display: grid; grid-template-rows: auto auto minmax(0, 1fr); gap: 6px; padding: 8px; border-radius: 12px; border: 1px solid var(--vscode-panel-border); background: var(--vscode-editorWidget-background, var(--vscode-editor-background)); box-sizing: border-box; }
  .emoji-cats { display: flex; gap: 4px; overflow-x: auto; }
  .emoji-cats .btn { min-width: 28px; padding: 0 6px; }
  .emoji-grid { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 2px; overflow: auto; }
  .emoji-grid .btn { width: 100%; min-height: 28px; padding: 0; }
  .media-picker { display: grid; gap: 8px; padding: 8px; border: 1px solid var(--vscode-panel-border); border-radius: 10px; background: var(--vscode-editorWidget-background, var(--vscode-editor-background)); }
  .media-picker { max-height: 240px; overflow: auto; }
  .media-grid { display: flex; flex-wrap: wrap; gap: 6px; }
  .media-grid .btn { width: 72px; height: 72px; padding: 4px; }
  .media-grid svg { width: 56px; height: 56px; }
  .image-bubble.loading { width: min(220px, 100%); height: 148px; border-radius: 12px; background: var(--vscode-input-background); position: relative; overflow: hidden; }
  .image-bubble.loading::after { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--vscode-foreground) 14%, transparent), transparent); }
  .image-error { display: grid; gap: 6px; min-width: 140px; padding: 8px; border-radius: 12px; background: var(--vscode-input-background); }
  .upload-bar { position: absolute; left: 8px; right: 8px; bottom: 8px; height: 3px; border-radius: 2px; overflow: hidden; background: color-mix(in srgb, var(--vscode-foreground) 25%, transparent); }
  .upload-bar::before { content: ""; display: block; width: 40%; height: 100%; background: var(--vscode-progressBar-background, var(--vscode-focusBorder)); }
  .lightbox { position: fixed; inset: 0; background: color-mix(in srgb, #000 72%, transparent); display: flex; align-items: center; justify-content: center; z-index: 30; padding: 16px; }
  .viewer { width: min(100%, 920px); max-height: 100%; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: 8px; }
  .viewer img { max-width: 100%; max-height: calc(100vh - 120px); object-fit: contain; justify-self: center; border-radius: 8px; }
  .viewer.zoomed { overflow: auto; }
  .viewer.zoomed img { max-width: none; max-height: none; cursor: zoom-out; }
  .viewer-bar, .viewer-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .chat-empty { display: grid; justify-items: start; text-align: left; gap: 6px; align-self: stretch; padding: 8px 0; }
  .msg-meta { margin-top: 4px; font-size: 11px; color: var(--vscode-descriptionForeground); }
  .msg.failed { outline: 1px solid var(--vscode-errorForeground); }
  .toast { position: sticky; bottom: 8px; margin: 8px 12px; padding: 8px 10px; border-radius: 8px; background: var(--vscode-notifications-background, var(--vscode-editorWidget-background)); color: var(--vscode-notifications-foreground, var(--vscode-foreground)); border: 1px solid var(--vscode-notifications-border, var(--vscode-panel-border)); }
  .status { margin-left: auto; font-size: 11px; color: var(--vscode-descriptionForeground); }
  #message-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; justify-content: flex-start; align-items: flex-start; gap: 8px; padding: 4px 0; }
  .day-sep { align-self: center; margin: 6px 0 2px; padding: 3px 10px; border-radius: 999px; font-size: 11px; background: var(--vscode-badge-background, var(--vscode-editorWidget-background)); color: var(--vscode-badge-foreground, var(--vscode-foreground)); }
  .history-note { align-self: center; font-size: 12px; }
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
    <p class="banner error" id="error" role="alert" hidden></p>
    <button class="btn" type="button" id="retry" hidden>Try again</button>
    <p class="banner notice" id="notice" role="status" hidden></p>

    <section data-screen="splash" class="splash">
      <div>
        <div class="mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M9.15 3.9 2.9 12l6.25 8.1 1.62-1.25L5.55 12l5.22-6.85L9.15 3.9Zm5.7 0-1.62 1.25L18.45 12l-5.22 6.85 1.62 1.25L21.1 12 14.85 3.9ZM11 9.15h2v5.7h-2v-5.7Z"/></svg></div>
        <h1>DevConnect</h1>
        <p class="muted">Connect. Collaborate. Code.</p>
        <div class="spinner" role="status" aria-label="Checking session"></div>
      </div>
    </section>

    <section data-screen="login" class="auth-screen" hidden>
      <div class="auth-layout">
        <aside class="auth-brand">
          <div class="auth-logo" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M9.15 3.9 2.9 12l6.25 8.1 1.62-1.25L5.55 12l5.22-6.85L9.15 3.9Zm5.7 0-1.62 1.25L18.45 12l-5.22 6.85 1.62 1.25L21.1 12 14.85 3.9ZM11 9.15h2v5.7h-2v-5.7Z"/></svg></div>
          <h2>DevConnect</h2>
          <p class="muted">Connect with developers and message them from Visual Studio Code.</p>
        </aside>
        <div class="auth-card">
          <div class="auth-logo" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M9.15 3.9 2.9 12l6.25 8.1 1.62-1.25L5.55 12l5.22-6.85L9.15 3.9Zm5.7 0-1.62 1.25L18.45 12l-5.22 6.85 1.62 1.25L21.1 12 14.85 3.9ZM11 9.15h2v5.7h-2v-5.7Z"/></svg></div>
          <div class="stack">
            <h1>Welcome back</h1>
            <p class="muted">Sign in to connect with your developer community.</p>
          </div>
          <p class="muted" id="http-warn" hidden>This API is HTTP. Do not use a production password here.</p>
          <form id="login-form" class="stack">
            <label>Username or email<input name="usernameOrEmail" autocomplete="username" required maxlength="254"></label>
            <label>Password<span class="secret"><input name="password" type="password" autocomplete="current-password" required maxlength="128"><button class="btn" type="button" data-toggle aria-label="Show password">Show</button></span></label>
            <button class="btn primary auth-submit" type="submit" data-label="Sign in" data-waiting="Signing in…">Sign in</button>
          </form>
          <div class="auth-links">
            <button class="btn quiet" type="button" data-go="forgot">Forgot password</button>
          </div>
          <p class="auth-foot muted">Don't have an account? <button class="btn quiet" type="button" data-go="signup">Create account</button></p>
        </div>
      </div>
    </section>

    <section data-screen="signup" class="auth-screen" hidden>
      <div class="auth-layout">
        <aside class="auth-brand">
          <div class="auth-logo" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M9.15 3.9 2.9 12l6.25 8.1 1.62-1.25L5.55 12l5.22-6.85L9.15 3.9Zm5.7 0-1.62 1.25L18.45 12l-5.22 6.85 1.62 1.25L21.1 12 14.85 3.9ZM11 9.15h2v5.7h-2v-5.7Z"/></svg></div>
          <h2>DevConnect</h2>
          <p class="muted">Join the developer community and keep the conversation inside the editor.</p>
        </aside>
        <div class="auth-card">
          <div class="auth-logo" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M9.15 3.9 2.9 12l6.25 8.1 1.62-1.25L5.55 12l5.22-6.85L9.15 3.9Zm5.7 0-1.62 1.25L18.45 12l-5.22 6.85 1.62 1.25L21.1 12 14.85 3.9ZM11 9.15h2v5.7h-2v-5.7Z"/></svg></div>
          <div class="stack">
            <h1>Create your account</h1>
            <p class="muted">Join DevConnect to discover and connect with developers.</p>
          </div>
          <form id="signup-form" class="stack">
            <label>Username<input name="username" autocomplete="username" required minlength="3" maxlength="30"></label>
            <label>Email<input name="email" type="email" autocomplete="email" required maxlength="254"></label>
            <label>Display name<input name="displayName" autocomplete="name" required maxlength="50"></label>
            <label>Password<span class="secret"><input name="password" type="password" autocomplete="new-password" required minlength="10" maxlength="128" aria-describedby="signup-password-hint"><button class="btn" type="button" data-toggle aria-label="Show password">Show</button></span></label>
            <p class="muted" id="signup-password-hint">Use 10–128 characters, including a letter and a digit. No spaces.</p>
            <button class="btn primary auth-submit" type="submit" data-label="Create account" data-waiting="Creating account…">Create account</button>
          </form>
          <p class="auth-foot muted">Already have an account? <button class="btn quiet" type="button" data-go="login">Sign in</button></p>
        </div>
      </div>
    </section>

    <section data-screen="forgot" class="auth-screen" hidden>
      <div class="auth-layout">
        <aside class="auth-brand">
          <div class="auth-logo" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M9.15 3.9 2.9 12l6.25 8.1 1.62-1.25L5.55 12l5.22-6.85L9.15 3.9Zm5.7 0-1.62 1.25L18.45 12l-5.22 6.85 1.62 1.25L21.1 12 14.85 3.9ZM11 9.15h2v5.7h-2v-5.7Z"/></svg></div>
          <h2>DevConnect</h2>
          <p class="muted">Reset the password for your DevConnect account.</p>
        </aside>
        <div class="auth-card">
          <div class="auth-logo" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M9.15 3.9 2.9 12l6.25 8.1 1.62-1.25L5.55 12l5.22-6.85L9.15 3.9Zm5.7 0-1.62 1.25L18.45 12l-5.22 6.85 1.62 1.25L21.1 12 14.85 3.9ZM11 9.15h2v5.7h-2v-5.7Z"/></svg></div>
          <div class="stack">
            <h1>Reset your password</h1>
            <p class="muted">Enter the email associated with your account to request a password reset. The response does not reveal whether that mailbox exists.</p>
          </div>
          <form id="forgot-form" class="stack">
            <label>Email<input name="email" type="email" autocomplete="email" required maxlength="254"></label>
            <button class="btn primary auth-submit" type="submit" data-label="Send reset link" data-waiting="Sending…">Send reset link</button>
          </form>
          <div class="auth-links">
            <button class="btn quiet" type="button" data-go="reset">I have a reset token</button>
            <button class="btn quiet" type="button" data-go="login">Back to sign in</button>
          </div>
        </div>
      </div>
    </section>

    <section data-screen="reset" class="auth-screen" hidden>
      <div class="auth-layout">
        <aside class="auth-brand">
          <div class="auth-logo" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M9.15 3.9 2.9 12l6.25 8.1 1.62-1.25L5.55 12l5.22-6.85L9.15 3.9Zm5.7 0-1.62 1.25L18.45 12l-5.22 6.85 1.62 1.25L21.1 12 14.85 3.9ZM11 9.15h2v5.7h-2v-5.7Z"/></svg></div>
          <h2>DevConnect</h2>
          <p class="muted">Choose a new password for your DevConnect account.</p>
        </aside>
        <div class="auth-card">
          <div class="auth-logo" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M9.15 3.9 2.9 12l6.25 8.1 1.62-1.25L5.55 12l5.22-6.85L9.15 3.9Zm5.7 0-1.62 1.25L18.45 12l-5.22 6.85 1.62 1.25L21.1 12 14.85 3.9ZM11 9.15h2v5.7h-2v-5.7Z"/></svg></div>
          <div class="stack">
            <h1>Choose a new password</h1>
            <p class="muted">Enter the reset token from your email and a new password.</p>
          </div>
          <form id="reset-form" class="stack">
            <label>Reset token<input name="token" autocomplete="one-time-code" required maxlength="512"></label>
            <label>New password<span class="secret"><input name="newPassword" type="password" autocomplete="new-password" required minlength="10" maxlength="128" aria-describedby="reset-password-hint"><button class="btn" type="button" data-toggle aria-label="Show password">Show</button></span></label>
            <p class="muted" id="reset-password-hint">Use 10–128 characters, including a letter and a digit. No spaces.</p>
            <button class="btn primary auth-submit" type="submit" data-label="Update password" data-waiting="Updating…">Update password</button>
          </form>
          <p class="auth-foot muted"><button class="btn quiet" type="button" data-go="login">Back to sign in</button></p>
        </div>
      </div>
    </section>

    <section data-screen="home" class="stack" hidden>
      <h1 id="home-title">Home</h1>
      <div id="story-row" class="story-row">
        <button class="btn quiet story-scroll" type="button" id="story-scroll-left" aria-label="Scroll stories backward">‹</button>
        <div id="story-scroller" class="story-scroller" tabindex="0" aria-label="Stories">
          <div id="story-items" class="story-items"></div>
        </div>
        <button class="btn quiet story-scroll" type="button" id="story-scroll-right" aria-label="Scroll stories forward">›</button>
      </div>
      <p class="muted" id="story-note"></p>
      <p class="muted" id="home-copy"></p>
      <div class="stats" id="home-stats"></div>
      <h2>Recent activity</h2>
      <div id="home-activity" class="stack"></div>
    </section>

    <section data-screen="search" class="stack" hidden>
      <h1>Search</h1>
      <p class="muted">Find people in your developer network.</p>
      <form id="search-form">
        <label>Search developers
          <span class="search-field">
            <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Zm5.2-2.3 4.3 4.3"/></svg>
            <input id="search-query" name="query" maxlength="80" placeholder="Username or name">
          </span>
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
          <button class="btn quiet icon-btn" type="button" id="thread-menu" data-act="thread-menu" aria-label="Chat options" aria-haspopup="menu" aria-expanded="false" aria-controls="thread-menu-pop">⋮</button>
          <div id="thread-menu-pop" class="menu-pop" role="menu" data-mode="${chatBlockMenuActionForState(state) ?? "none"}" hidden>
            ${chatMenuMarkup(chatBlockMenuActionForState(state))}
          </div>
        </div>
        <p class="muted" id="thread-connection" hidden>Reconnecting...</p>
        <div id="message-list"></div>
        <section id="library" hidden>
          <div class="thread-head">
            <button class="btn quiet" type="button" id="library-back">← Chat</button>
            <strong id="library-title">Search</strong>
          </div>
          <div class="search-bar" id="search-bar">
            <input id="search-input" type="search" maxlength="80" placeholder="Search this chat" aria-label="Search this chat" autocomplete="off">
            <button class="btn quiet" type="button" id="search-clear" aria-label="Clear search">Clear</button>
            <button class="btn quiet" type="button" id="search-prev" aria-label="Previous match">↑</button>
            <button class="btn quiet" type="button" id="search-next" aria-label="Next match">↓</button>
          </div>
          <p class="muted" id="library-status"></p>
          <div id="library-body" class="stack"></div>
        </section>
        <div id="emoji-picker" class="emoji-picker" role="dialog" aria-label="Choose an emoji" hidden>
          <input id="emoji-search" type="search" maxlength="32" placeholder="Search emoji" aria-label="Search emoji" autocomplete="off">
          <div id="emoji-cats" class="emoji-cats"></div>
          <div id="emoji-grid" class="emoji-grid"></div>
        </div>
        <button class="btn" type="button" id="jump-latest" hidden>↓ New messages</button>
        <p class="muted" id="thread-block" hidden>You blocked this user.</p>
        <form id="message-form" class="composer">
          <div id="attach-tray" class="attach-panel" hidden></div>
          <div id="media-picker" class="media-picker" hidden>
            <div class="row">
              <button class="btn" type="button" data-act="picker-tab" data-id="sticker">Stickers</button>
              <button class="btn" type="button" data-act="picker-tab" data-id="gif">GIFs</button>
            </div>
            <label id="gif-search-label">Search GIFs<input id="gif-query" type="search" maxlength="40" placeholder="Search GIFs" autocomplete="off"></label>
            <p class="muted">GIF search stays on this device. DevConnect does not send the search to a GIF service.</p>
            <div id="media-grid" class="media-grid"></div>
            <p class="muted" id="media-empty" hidden>No GIFs match that search.</p>
          </div>
          <div class="composer-row">
            <div class="attach-wrap">
              <button class="btn quiet attach-btn" id="attach-btn" type="button" data-act="toggle-attach" data-id="attach" aria-label="Attach files" aria-haspopup="menu" aria-expanded="false" title="Attach files"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M8.2 12.4 14.6 6a3.2 3.2 0 0 1 4.5 4.5l-8.2 8.2a4.6 4.6 0 0 1-6.5-6.5l7.4-7.4"/></svg></button>
              <div id="attach-menu" class="attach-menu" role="menu" hidden>
                <button class="btn quiet" type="button" role="menuitem" data-act="pick-files" data-id="image">Photos and images</button>
                <button class="btn quiet" type="button" role="menuitem" data-act="pick-files" data-id="document">Documents and archives</button>
                <button class="btn quiet" type="button" role="menuitem" data-act="pick-files" data-id="any">Browse files</button>
              </div>
            </div>
            <button class="btn quiet attach-btn" id="sticker-btn" type="button" data-act="open-picker" data-id="sticker" aria-label="Stickers" title="Stickers">☺</button>
            <button class="btn quiet attach-btn" id="gif-btn" type="button" data-act="open-picker" data-id="gif" aria-label="GIFs" title="GIFs">GIF</button>
            <label class="composer-field">Message
              <textarea name="text" maxlength="4000" rows="1" placeholder="Write a message..."></textarea>
            </label>
            <button class="btn primary send-btn" id="send-btn" type="submit" aria-label="Send" title="Send" disabled>➤</button>
          </div>
          <input id="file-input" type="file" multiple hidden>
        </form>
        <div id="lightbox" class="lightbox" hidden></div>
        <section id="story-composer" class="story-overlay" hidden>
          <form id="story-form" class="story-sheet">
            <div class="thread-head">
              <strong>New story</strong>
              <button class="btn quiet" type="button" id="story-cancel">Cancel</button>
            </div>
            <div id="story-preview" class="story-stage muted">Choose a photo or a video up to 15 seconds.</div>
            <div class="row">
              <button class="btn" type="button" id="story-pick">Choose media</button>
              <button class="btn quiet" type="button" id="story-clear-media" hidden>Remove</button>
            </div>
            <input id="story-file" type="file" accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm" hidden>
            <label>Caption<input id="story-caption" maxlength="160" placeholder="Say something"></label>
            <div class="row" role="radiogroup" aria-label="Caption style">
              <label><input type="radio" name="story-style" value="plain" checked> Plain</label>
              <label><input type="radio" name="story-style" value="light"> Light</label>
              <label><input type="radio" name="story-style" value="dark"> Dark</label>
            </div>
            <p class="muted" id="story-form-error" hidden></p>
            <button class="btn primary" type="submit" id="story-publish">Share story</button>
          </form>
        </section>
        <section id="story-viewer" class="story-overlay" hidden>
          <div class="story-sheet story-player" role="dialog" aria-label="Story">
            <div id="story-progress" class="story-progress"></div>
            <div class="thread-head">
              <strong id="story-who"></strong>
              <span class="muted" id="story-when"></span>
              <button class="btn quiet" type="button" id="story-close" aria-label="Close story">Close</button>
            </div>
            <div id="story-media" class="story-stage"></div>
            <p id="story-caption-view"></p>
            <div class="row" id="story-reactions"></div>
            <form id="story-reply" class="row" hidden>
              <input id="story-reply-text" maxlength="2000" placeholder="Reply privately" aria-label="Reply to story">
              <button class="btn" type="submit">Send</button>
            </form>
            <div class="row" id="story-owner-tools" hidden>
              <button class="btn quiet" type="button" id="story-viewers-btn">Viewers</button>
              <button class="btn quiet danger" type="button" id="story-delete">Delete</button>
            </div>
            <div id="story-viewer-list" class="stack" hidden></div>
            <div class="story-nav">
              <button class="btn quiet" type="button" id="story-prev" aria-label="Previous story">Previous</button>
              <button class="btn quiet" type="button" id="story-next" aria-label="Next story">Next</button>
            </div>
          </div>
        </section>
      </div>
    </section>

    <section data-screen="notifications" class="stack" hidden>
      <div class="row">
        <h1>Notifications</h1>
        <div class="row note-actions">
          <button class="btn quiet" type="button" id="clear-notifications" disabled>Clear notifications</button>
          <button class="btn quiet" type="button" id="read-all">Mark all read</button>
        </div>
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
        <form id="recovery-form" class="stack">
          <p class="muted">Save a recovery passphrase on this installation before you reset the laptop, reinstall DevConnect, or sign in on another device. The passphrase encrypts this device's key. The server cannot read the key or your messages.</p>
          <p class="muted">On this device: enter 10 characters, click Save recovery passphrase, and store that passphrase somewhere outside this laptop.</p>
          <p class="muted">On a new installation: sign in, open Settings, then Security, enter the same passphrase, and click Restore this device.</p>
          <p class="muted">If no passphrase was saved before an installation was wiped, messages sealed to that installation cannot be opened. A forgotten passphrase cannot be reset.</p>
          <label class="field">Recovery passphrase<input name="passphrase" type="password" autocomplete="new-password" required minlength="10" maxlength="10"></label>
          <div class="row">
            <button class="btn primary" type="submit" id="save-recovery">Save recovery passphrase</button>
            <button class="btn" type="button" id="restore-recovery">Restore this device</button>
            <button class="btn quiet" type="button" id="skip-recovery">Continue without old messages</button>
          </div>
        </form>
        <div id="device-list" class="stack"></div>
        <button class="btn danger" type="button" id="logout-btn">Log out</button>
      </div>
      <div id="settings-about" class="stack" hidden>
        <button class="btn quiet" type="button" data-settings="menu">Settings</button>
        <h1>About</h1>
        <p>DevConnect</p>
        <p class="muted" id="about-version">Version 0.4.58</p>
        <p class="muted">A developer network inside Visual Studio Code. Messages stay encrypted on your devices.</p>
      </div>
    </section>
      </main>
  </div>
</div>
  <div class="dialog-back" id="dialog" hidden>
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-text">
      <h2 id="dialog-title" hidden></h2>
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
  let noticeTimer = 0;
  let shownNotice = "";
  let dismissedNotice = "";
  let searchTimer = 0;
  let friendTab = "friends";
  let seenPanelSeq = -1;
  let chatQuery = "";
    let lastThreadId = "";
    let lastMessageCount = 0;
    let lastNewestId = "";
    let openMenuId = "";
    function paintPicker() {
      const box = document.getElementById("media-picker");
      const grid = document.getElementById("media-grid");
      const empty = document.getElementById("media-empty");
      const search = document.getElementById("gif-search-label");
      if (!box || !grid) return;
      box.hidden = !pickerTab;
      if (search) search.hidden = pickerTab !== "gif";
      const needle = gifQuery.trim().toLowerCase();
      const items = pickerTab === "gif"
        ? gifCatalog.filter((item) => !needle || item.name.toLowerCase().indexOf(needle) >= 0 || item.keywords.join(" ").indexOf(needle) >= 0)
        : pickerTab === "sticker" ? stickerCatalog : [];
      if (empty) empty.hidden = pickerTab !== "gif" || items.length > 0;
      grid.innerHTML = items.map((item) => {
        if (item.svg) return '<button class="btn" type="button" data-act="send-media" data-kind="sticker" data-id="' + esc(item.id) + '" aria-label="Send sticker ' + esc(item.name) + '">' + item.svg + '</button>';
        return '<button class="btn motion ' + esc(item.motion) + '" type="button" data-act="send-media" data-kind="gif" data-id="' + esc(item.id) + '" aria-label="Send GIF ' + esc(item.name) + '"><i></i></button>';
      }).join("");
    }
  let heldNew = 0;
  let publishedViewing = "";
  function publishViewing() {
    const protectedScreens = ["home", "search", "user", "friends", "messages", "notifications", "profile", "settings"];
    const visible = state.phase !== "ready"
      ? "splash"
      : (!state.authenticated && protectedScreens.indexOf(state.screen) >= 0 ? "login" : state.screen);
    const conversationId = visible === "messages" && state.activeConversationId ? state.activeConversationId : null;
    const documentVisible = document.visibilityState !== "hidden";
    const webviewFocused = document.hasFocus();
    const key = (conversationId || "") + ":" + (documentVisible ? "1" : "0") + ":" + (webviewFocused ? "1" : "0");
    if (key === publishedViewing) return;
    publishedViewing = key;
    vscode.postMessage({ version: 1, type: "viewingConversation", conversationId: conversationId, documentVisible: documentVisible, webviewFocused: webviewFocused });
  }
  let typingOn = false;
  let typingStopTimer = 0;
  const typingCommand = ${typingCommand.toString()};
  const chatMenuMarkup = ${chatMenuMarkup.toString()};
  const searchEntries = ${searchEntries.toString()};
  const mediaEntries = ${mediaEntries.toString()};
  const documentEntries = ${documentEntries.toString()};
  const highlightMatch = ${highlightMatch.toString()};
  const sortByTime = ${sortByTime.toString()};
  const escapeHtml = ${escapeHtml.toString()};
  const TYPING_IDLE_MS = ${TYPING_IDLE_MS};
  const chatActivity = ${chatActivity.toString()};
  let settingsPane = "menu";
  let editing = false;
  let dialogAction = null;

  const dateSeparatorLabel = ${dateSeparatorLabel.toString()};
  const attachmentCaption = ${attachmentCaption.toString()};
  const fileKind = ${fileKind.toString()};
  const fileTypeLabel = ${fileTypeLabel.toString()};
  const stickerCatalog = ${JSON.stringify(STICKERS)};
  const gifCatalog = ${JSON.stringify(GIFS)};
  const quickReactions = ${JSON.stringify(QUICK_REACTIONS)};
  const emojiCatalog = ${JSON.stringify(EMOJI_CATEGORIES)};
  function placePicker(anchor, picker, view) {
    const margin = 8;
    let top = anchor.top - picker.height - margin;
    if (top < margin) top = anchor.bottom + margin;
    if (top + picker.height > view.height - margin) top = Math.max(margin, view.height - picker.height - margin);
    let left = anchor.left;
    if (left + picker.width > view.width - margin) left = view.width - picker.width - margin;
    if (left < margin) left = margin;
    return { top: top, left: left };
  }
  let pickerTab = "";
  let gifQuery = "";
  let reactFor = "";
  let emojiTarget = "";
  let emojiCategory = "Smileys";
  let emojiQuery = "";
  let recentEmoji = [];
  function closeEmojiPicker() {
    emojiTarget = "";
    const picker = document.getElementById("emoji-picker");
    if (picker) picker.hidden = true;
  }
  function paintEmojiPicker() {
    const picker = document.getElementById("emoji-picker");
    const cats = document.getElementById("emoji-cats");
    const grid = document.getElementById("emoji-grid");
    if (!picker || !cats || !grid) return;
    picker.hidden = !emojiTarget;
    const needle = emojiQuery.trim().toLowerCase();
    const recent = !needle && recentEmoji.length ? recentEmoji.map((emoji) => ({ emoji: emoji, name: "recent" })) : [];
    const source = needle
      ? emojiCatalog.reduce((all, category) => all.concat(category.items), [])
      : ((emojiCatalog.find((category) => category.id === emojiCategory) || emojiCatalog[0] || { items: [] }).items);
    const items = needle ? source.filter((item) => item.name.indexOf(needle) >= 0 || item.emoji === needle) : recent.concat(source);
    cats.innerHTML = emojiCatalog.map((category) => '<button class="btn" type="button" data-act="emoji-cat" data-id="' + esc(category.id) + '" aria-pressed="' + (category.id === emojiCategory ? "true" : "false") + '" aria-label="' + esc(category.id) + '">' + esc(category.id.slice(0, 1)) + '</button>').join("");
    grid.innerHTML = items.length
      ? items.map((item) => '<button class="btn" type="button" data-act="emoji-pick" data-id="' + esc(emojiTarget) + '" data-emoji="' + esc(item.emoji) + '" aria-label="' + esc(item.name) + '">' + item.emoji + '</button>').join("")
      : '<p class="muted">No emoji match.</p>';
  }
  function openEmojiPicker(messageId, anchor) {
    emojiTarget = messageId;
    paintEmojiPicker();
    const picker = document.getElementById("emoji-picker");
    if (!picker || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    const spot = placePicker(
      { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
      { width: Math.min(280, window.innerWidth - 16), height: 240 },
      { width: window.innerWidth, height: window.innerHeight }
    );
    picker.style.top = spot.top + "px";
    picker.style.left = spot.left + "px";
    const search = document.getElementById("emoji-search");
    if (search) search.focus();
  }
  const shouldLoadOlderHistory = ${shouldLoadOlderHistory.toString()};
  let olderRequestArmed = true;
  let olderScrollReady = false;
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
      displayName: conversation.peerDisplayName || "Developer",
      profileImageUrl: conversation.peerProfileImageUrl || "",
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
    if (person && person.relationship === "BLOCKED") return null;
    if (userId && (state.blockedUsers || []).some((user) => user.id === userId)) return null;
    const live = state.presenceByUser && userId ? state.presenceByUser[userId] : null;
    return live || (person && person.presence) || null;
  }
  function presenceText(presence) {
    if (!presence || !presence.status) return "";
    if (presence.status === "ONLINE") return "Online";
    if (presence.lastSeenAt) return "Last seen " + when(presence.lastSeenAt);
    return "Offline";
  }
  let pendingFiles = [];
  let attachMenuOpen = false;
  let threadMenuOpen = false;
  let libraryQuery = "";
  let libraryQueryTimer = 0;
  let docOrder = "newest";
  let searchIndex = 0;
  let lastHighlight = "";
  let trackedLibraryChat = "";
  function moveSearch(step) {
    const hits = document.querySelectorAll("#library-body .search-hit");
    if (!hits.length) return;
    searchIndex = (searchIndex + step + hits.length) % hits.length;
    paintLibrary();
    const current = document.querySelectorAll("#library-body .search-hit")[searchIndex];
    if (current && current.scrollIntoView) current.scrollIntoView({ block: "nearest" });
  }
  function paintLibrary() {
    const chatId = state.activeConversationId || "";
    if (chatId !== trackedLibraryChat) {
      trackedLibraryChat = chatId;
      libraryQuery = "";
      searchIndex = 0;
    }
    const pane = state.threadPane || "chat";
    const title = document.getElementById("library-title");
    const bar = document.getElementById("search-bar");
    const status = document.getElementById("library-status");
    const body = document.getElementById("library-body");
    if (title) title.textContent = pane === "media" ? "Media" : pane === "docs" ? "Docs" : "Search";
    if (bar) bar.hidden = pane !== "search";
    const input = document.getElementById("search-input");
    if (input instanceof HTMLInputElement && document.activeElement !== input && input.value !== libraryQuery) input.value = libraryQuery;
    if (!body || !status) return;
    body.className = pane === "media" ? "media-grid" : "stack";
    const same = state.libraryConversationId && state.libraryConversationId === state.activeConversationId;
    const entries = same ? (state.library || []) : [];
    if (!same && pane !== "chat") {
      status.textContent = "Loading this chat…";
      body.innerHTML = "";
      return;
    }
    if (state.libraryLoading) {
      status.textContent = "Loading this chat…";
      body.innerHTML = "";
      return;
    }
    if (state.libraryError) {
      status.textContent = "";
      body.innerHTML = '<div class="history-note"><span>' + esc(state.libraryError) + '</span> <button class="btn" type="button" data-act="library-retry" data-id="library">Try again</button></div>';
      return;
    }
    const partial = same && state.libraryComplete === false ? " Older messages were not included." : "";
    if (pane === "search") {
      const hits = searchEntries(entries, libraryQuery);
      if (!libraryQuery.trim()) {
        status.textContent = partial ? "Type to search this chat." + partial : "Type to search messages, captions, and file names in this chat.";
        body.innerHTML = "";
        return;
      }
      status.textContent = (hits.length === 1 ? "1 match" : hits.length + " matches") + partial;
      if (!hits.length) {
        body.innerHTML = '<p class="muted">No messages match that search.</p>';
        return;
      }
      if (searchIndex >= hits.length) searchIndex = 0;
      const whoFor = (senderId) => state.user && senderId === state.user.id ? "You" : (document.getElementById("thread-name").textContent || "Developer");
      body.innerHTML = hits.map((entry, index) => {
        const preview = entry.text || (entry.files[0] && entry.files[0].name) || "Message";
        return '<button class="btn quiet search-hit' + (index === searchIndex ? " flash" : "") + '" type="button" data-act="reveal-message" data-id="' + esc(entry.id) + '"><strong>' + esc(whoFor(entry.senderId)) + '</strong><span>' + highlightMatch(preview.slice(0, 180), libraryQuery) + '</span><span class="muted">' + esc(when(entry.createdAt)) + '</span></button>';
      }).join("");
      return;
    }
    if (pane === "media") {
      const items = mediaEntries(entries);
      status.textContent = items.length ? (items.length + (items.length === 1 ? " item" : " items") + partial) : "";
      if (!items.length) {
        body.innerHTML = '<p class="muted">No photos, videos, or GIFs in this chat yet.</p>';
        return;
      }
      body.innerHTML = items.map((entry) => {
        const visual = (entry.files || []).find((file) => file.bucket !== "file");
        const label = entry.mediaKind === "gif" ? "GIF" : entry.mediaKind === "sticker" ? "Sticker" : (visual && visual.bucket === "video" ? "Video" : visual && visual.bucket === "gif" ? "GIF" : "Photo");
        const preview = visual && typeof visual.preview === "string" && visual.preview.indexOf("data:image/") === 0
          ? '<img src="' + visual.preview + '" alt="' + esc(visual.name || label) + '">'
          : '<span>' + esc(label) + '</span>';
        const act = visual && visual.preview ? "open-library-preview" : "reveal-message";
        return '<button class="media-tile" type="button" data-act="' + act + '" data-id="' + esc(entry.id) + '" data-name="' + esc((visual && visual.name) || entry.text || label) + '" aria-label="' + esc(label) + '">' + preview + '</button>';
      }).join("");
      return;
    }
    if (pane === "docs") {
      const docs = sortByTime(documentEntries(entries).flatMap((entry) => (entry.files || []).filter((file) => file.bucket === "file").map((file) => ({
        id: file.id, name: file.name, size: file.size, messageId: entry.id, senderId: entry.senderId, createdAt: entry.createdAt,
      }))), docOrder);
      status.textContent = docs.length ? (docs.length + (docs.length === 1 ? " file" : " files") + partial) : "";
      const sort = '<div class="row"><button class="btn quiet" type="button" data-act="docs-sort" data-id="newest">Newest</button><button class="btn quiet" type="button" data-act="docs-sort" data-id="oldest">Oldest</button></div>';
      body.innerHTML = sort + (docs.length ? docs.map((file) => {
        const who = state.user && file.senderId === state.user.id ? "You" : (document.getElementById("thread-name").textContent || "Developer");
        return '<div class="doc-row"><button class="btn quiet doc-row" type="button" data-act="save-library" data-id="' + esc(file.messageId) + '" data-file="' + esc(file.id) + '"><span class="name">' + esc(file.name) + '</span><span class="muted">' + esc(fileSize(file.size)) + " · " + esc(who) + " · " + esc(when(file.createdAt)) + '</span></button><button class="btn quiet" type="button" data-act="reveal-message" data-id="' + esc(file.messageId) + '">Show</button></div>';
      }).join("") : '<p class="muted">No documents or files in this chat yet.</p>');
    }
  }
  let storyFile = null;
  let storyTimer = 0;
  let storyPaused = false;
  let storySubmitLock = false;
  const storyEmojis = ["❤️", "😂", "😮", "😢", "🔥", "👍"];
  function storyPlaylist() {
    const tray = state.storyTray || { mine: [], rings: [] };
    const items = (tray.mine || []).slice();
    (tray.rings || []).forEach((ring) => (ring.stories || []).forEach((story) => items.push(story)));
    return items;
  }
  function moveStory(step) {
    const items = storyPlaylist();
    const index = items.findIndex((story) => state.storyViewer && story.id === state.storyViewer.storyId);
    const next = items[index + step];
    if (!next) {
      vscode.postMessage({ version: 1, type: "closeStory" });
      return;
    }
    vscode.postMessage({ version: 1, type: "viewStory", storyId: next.id });
  }
  function armStoryTimer() {
    window.clearTimeout(storyTimer);
    storyTimer = 0;
    const viewer = state.storyViewer;
    const stage = state.storyStage;
    if (!viewer || storyPaused || !stage || stage.failed || stage.storyId !== viewer.storyId || stage.mediaType !== "IMAGE") return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    storyTimer = window.setTimeout(() => moveStory(1), 5000);
  }
  function paintStoryViewer() {
    const overlay = document.getElementById("story-viewer");
    const open = !!(state.storyViewer && state.authenticated);
    if (overlay) overlay.hidden = !open;
    if (!open) {
      window.clearTimeout(storyTimer);
      storyTimer = 0;
      return;
    }
    const items = storyPlaylist();
    const current = items.find((story) => story.id === state.storyViewer.storyId) || null;
    const ownerStories = items.filter((story) => current && story.ownerId === current.ownerId);
    const progress = document.getElementById("story-progress");
    if (progress) {
      const index = ownerStories.findIndex((story) => current && story.id === current.id);
      progress.innerHTML = ownerStories.map((story, position) => '<i class="' + (position <= index ? "on" : "") + '"></i>').join("");
    }
    const who = document.getElementById("story-who");
    const person = (state.storyTray && state.storyTray.rings || []).find((ring) => current && ring.user.id === current.ownerId);
    if (who) who.textContent = current && current.mine ? "Your story" : (person && (person.user.displayName || person.user.username)) || "Story";
    const whenLabel = document.getElementById("story-when");
    if (whenLabel) whenLabel.textContent = current ? when(current.createdAt) : "";
    const caption = document.getElementById("story-caption-view");
    if (caption) {
      caption.textContent = current && current.caption ? current.caption : "";
      caption.className = current && current.textStyle ? current.textStyle : "plain";
    }
    const media = document.getElementById("story-media");
    const stage = state.storyStage;
    const key = stage && current && stage.storyId === current.id ? stage.storyId + ":" + (stage.failed ? "fail" : stage.dataUrl.length) : "loading";
    if (media && media.getAttribute("data-story") !== key) {
      media.setAttribute("data-story", key);
      if (!stage || !current || stage.storyId !== current.id) media.innerHTML = '<span class="muted">Loading story…</span>';
      else if (stage.failed) media.innerHTML = '<span class="muted">This story could not be opened.</span>';
      else if (stage.mediaType === "VIDEO") media.innerHTML = '<video src="' + esc(stage.dataUrl) + '" playsinline></video>';
      else media.innerHTML = '<img src="' + esc(stage.dataUrl) + '" alt="' + esc(current.caption || "Story") + '">';
      const video = media.querySelector("video");
      if (video) {
        video.addEventListener("ended", () => { if (!storyPaused) moveStory(1); });
        const started = video.play();
        if (started && started.catch) started.catch(() => undefined);
      }
    }
    const reply = document.getElementById("story-reply");
    const tools = document.getElementById("story-owner-tools");
    if (reply) reply.hidden = !current || current.mine;
    if (tools) tools.hidden = !current || !current.mine;
    const reactions = document.getElementById("story-reactions");
    if (reactions) {
      reactions.hidden = !current || current.mine;
      reactions.innerHTML = storyEmojis.map((emoji) => '<button class="btn quiet' + (current && current.myReaction === emoji ? " primary" : "") + '" type="button" data-act="react-story" data-id="' + esc(current ? current.id : "") + '" data-emoji="' + emoji + '" aria-label="React ' + emoji + '">' + emoji + '</button>').join("");
    }
    const list = document.getElementById("story-viewer-list");
    if (list && current && current.mine) {
      const people = state.storyViewers || [];
      list.innerHTML = people.length
        ? people.map((person) => '<span>' + esc(person.displayName || person.username) + ' · ' + esc(when(person.viewedAt)) + '</span>').join("")
        : '<span class="muted">' + (current.viewCount ? current.viewCount + ' views' : 'No views yet') + '</span>';
    }
    armStoryTimer();
  }
  function paintStories() {
    const items = document.getElementById("story-items");
    const note = document.getElementById("story-note");
    if (!items || !note) return;
    const tray = state.storyTray || { mine: [], rings: [] };
    const mine = tray.mine || [];
    if (state.storiesLoading && !mine.length && !(tray.rings || []).length) {
      items.innerHTML = '<div class="story-skel"></div><div class="story-skel"></div><div class="story-skel"></div>';
      note.textContent = "";
      paintStoryViewer();
      return;
    }
    const self = state.user;
    const tiles = ['<button class="story-tile" type="button" data-act="' + (mine.length ? "open-story" : "add-story") + '" data-id="' + esc(self ? self.id : "me") + '" data-story="' + esc(mine[0] ? mine[0].id : "") + '"><span class="story-ring mine"><span class="story-avatar">' + avatarMarkup(self, "md") + (mine.length ? "" : '<span class="story-plus" aria-hidden="true">+</span>') + '</span></span><span class="story-name">Your story</span></button>'];
    if (mine.length) tiles.push('<button class="story-tile" type="button" data-act="add-story" data-id="add-story"><span class="story-ring mine"><span class="story-avatar"><span class="story-plus" aria-hidden="true">+</span></span></span><span class="story-name">Add</span></button>');
    (tray.rings || []).forEach((ring) => {
      const first = (ring.stories || [])[0];
      const presence = state.presenceByUser && state.presenceByUser[ring.user.id];
      const online = presence && presence.status === "ONLINE" ? '<span class="presence" aria-label="Online"></span>' : "";
      tiles.push('<button class="story-tile" type="button" data-act="open-story" data-id="' + esc(ring.user.id) + '" data-story="' + esc(first ? first.id : "") + '"><span class="story-ring ' + (ring.unseen ? "unseen" : "seen") + '"><span class="story-avatar">' + avatarMarkup(ring.user, "md") + online + '</span></span><span class="story-name">' + esc(ring.user.displayName || ring.user.username) + '</span></button>');
    });
    items.innerHTML = tiles.join("");
    note.textContent = state.storiesError
      ? state.storiesError
      : (tray.rings || []).length ? "" : "Share a moment with your connections.";
    const composer = document.getElementById("story-composer");
    if (composer && state.storyViewer) composer.hidden = true;
    const formError = document.getElementById("story-form-error");
    if (formError && composer && !composer.hidden && state.error) {
      formError.hidden = false;
      formError.textContent = state.error;
      storySubmitLock = false;
    }
    paintStoryViewer();
  }
  function openStoryComposer() {
    const composer = document.getElementById("story-composer");
    const error = document.getElementById("story-form-error");
    if (composer) composer.hidden = false;
    if (error) { error.hidden = true; error.textContent = ""; }
  }
  function fileSize(size) {
    const value = Number(size) || 0;
    if (value < 1024) return value + " B";
    if (value < 1048576) return (value / 1024).toFixed(1) + " KB";
    return (value / 1048576).toFixed(1) + " MB";
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
    const protectedScreens = ["home", "search", "user", "friends", "messages", "notifications", "profile", "settings"];
    const visible = state.phase !== "ready"
      ? "splash"
      : (!state.authenticated && protectedScreens.indexOf(state.screen) >= 0 ? "login" : state.screen);
    document.querySelectorAll("[data-screen]").forEach((el) => { el.hidden = el.getAttribute("data-screen") !== visible; });
    document.body.classList.toggle("auth-view", ["login", "signup", "forgot", "reset"].indexOf(visible) >= 0);
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
    if (!state.notice) {
      shownNotice = "";
      dismissedNotice = "";
      window.clearTimeout(noticeTimer);
      notice.hidden = true;
      notice.textContent = "";
    } else if (state.notice === dismissedNotice) {
      notice.hidden = true;
    } else if (state.notice !== shownNotice) {
      shownNotice = state.notice;
      notice.hidden = false;
      notice.textContent = state.notice;
      window.clearTimeout(noticeTimer);
      const current = state.notice;
      noticeTimer = window.setTimeout(() => {
        dismissedNotice = current;
        notice.hidden = true;
      }, 4000);
    }
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
    const offline = state.authenticated && state.connection === "offline";
    live.hidden = !offline && state.connection !== "reconnecting" && state.connection !== "connecting";
    live.textContent = offline
      ? "Offline. Pending messages stay in this chat and send when you reconnect."
      : state.connection === "reconnecting" ? "Reconnecting…" : "Connecting…";
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
    paintStories();
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
    const savedChat = !!(openChat && openChat.updatedAt && openChat.createdAt && openChat.updatedAt !== openChat.createdAt);
    document.getElementById("thread-name").textContent = person.name;
    const otherId = openChat && state.user ? (openChat.participantIds || []).find((id) => id !== state.user.id) : "";
    const blockedPeer = !!(otherId && (state.blockedUsers || []).some((user) => user.id === otherId));
    const lock = state.messageLock === "blocked-me" ? "blocked-me" : (state.messageLock === "blocked-by-me" || blockedPeer) ? "blocked-by-me" : "none";
    const threadUser = document.getElementById("thread-user");
    const presenceAllowed = lock === "none";
    const typingHere = presenceAllowed && !!(state.typing && state.typing.conversationId === state.activeConversationId && state.typing.userId === otherId);
    const threadActivity = chatActivity(presenceAllowed ? presenceFor(otherId) : null, typingHere, presenceAllowed);
    const username = person.username ? "@" + person.username : "";
    const typingHtml = '<span class="typing" role="status" aria-label="Typing"><i></i><i></i><i></i>typing...</span>';
    const onlineHtml = '<span class="presence" data-state="online" role="img" aria-label="Online"></span>Online';
    if (threadActivity === "online-typing") threadUser.innerHTML = [esc(username), onlineHtml + " · " + typingHtml].filter(Boolean).join(" · ");
    else if (threadActivity === "online") threadUser.innerHTML = [esc(username), onlineHtml].filter(Boolean).join(" · ");
    else if (threadActivity === "typing") threadUser.innerHTML = [esc(username), typingHtml].filter(Boolean).join(" · ");
    else if (threadActivity === "last-seen") threadUser.textContent = [username, "Last seen " + when(presenceFor(otherId).lastSeenAt)].filter(Boolean).join(" · ");
    else if (threadActivity === "offline") threadUser.textContent = [username, "Offline"].filter(Boolean).join(" · ");
    else threadUser.textContent = username;
    const threadAvatar = document.getElementById("thread-avatar");
    if (threadAvatar) threadAvatar.innerHTML = avatarMarkup({ displayName: person.name, username: person.username }, "md");
    const threadProfile = document.getElementById("thread-profile");
    if (threadProfile) {
      threadProfile.hidden = !otherId;
      threadProfile.setAttribute("data-id", otherId || "");
    }
    if (state.screen !== "messages" || !state.activeConversationId) threadMenuOpen = false;
    const threadMenu = document.getElementById("thread-menu");
    const threadPop = document.getElementById("thread-menu-pop");
    if (threadMenu) {
      threadMenu.hidden = !state.activeConversationId;
      threadMenu.disabled = !!state.busy;
      threadMenu.setAttribute("aria-expanded", threadMenuOpen ? "true" : "false");
      if (state.busy) threadMenu.setAttribute("aria-busy", "true");
      else threadMenu.removeAttribute("aria-busy");
    }
    const iBlocked = !!(otherId && (state.blockedUsers || []).some((user) => user.id === otherId));
    const menuMode = !otherId || (state.user && otherId === state.user.id) ? "none" : iBlocked ? "unblock" : "block";
    if (threadPop && threadPop.getAttribute("data-mode") !== menuMode) {
      threadPop.setAttribute("data-mode", menuMode);
      threadPop.innerHTML = chatMenuMarkup(menuMode === "unblock" ? "unblock" : menuMode === "block" ? "block" : null);
    }
    if (threadPop) threadPop.hidden = !threadMenuOpen;
    const threadBlock = document.getElementById("thread-block");
    const messageForm = document.getElementById("message-form");
    const pane = state.threadPane || "chat";
    const libraryPanel = document.getElementById("library");
    if (libraryPanel) libraryPanel.hidden = pane === "chat";
    if (threadBlock && messageForm) {
      threadBlock.hidden = pane !== "chat" || lock === "none";
      messageForm.hidden = pane !== "chat" || lock !== "none";
      threadBlock.innerHTML = lock === "blocked-me"
        ? "This conversation is unavailable.<br>You can't message this user."
        : 'You blocked this user. <button class="btn" type="button" data-act="unblock" data-id="' + esc(otherId || "") + '" data-name="' + esc(person.username || person.name) + '">Unblock</button>';
    }
    const list = document.getElementById("message-list");
    if (list) list.hidden = pane !== "chat";
    const previousTop = list.scrollTop;
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 48;
    const ordered = (state.messages || []).slice().reverse();
    const switchedThread = state.activeConversationId !== lastThreadId;
    if (switchedThread) {
      lastThreadId = state.activeConversationId || "";
      lastMessageCount = 0;
      lastNewestId = "";
      heldNew = 0;
    }
    const newestId = ordered.length ? ordered[ordered.length - 1].id : "";
    const olderPage = !switchedThread && ordered.length > lastMessageCount && newestId === lastNewestId && lastNewestId !== "";
    const previousHeight = list.scrollHeight;
    let lastDay = "";
    const nowMs = Date.now();
    const recoveryBanner = !ordered.some((item) => item.sealed) ? ""
      : state.keyRecovery === "needed"
        ? '<p class="muted">This installation has no device key. Open Settings, then Security, and restore your recovery passphrase to read messages from the previous installation.</p>'
        : state.keyRecovery === "unavailable"
          ? '<p class="muted">These messages are saved on the server. The previous installation did not leave a recovery passphrase, so this device cannot open them.</p>'
          : '<p class="muted">These messages were sealed by an earlier installation. A recovery passphrase saved on this device protects this device only, and cannot open them.</p>';
    const historyBanner = ordered.length && state.historyLoading
      ? '<div class="history-note muted">Loading earlier messages…</div>'
      : ordered.length && state.historyError
        ? '<div class="history-note"><span>' + esc(state.historyError) + '</span> <button class="btn" type="button" data-act="load-older">Try again</button></div>'
        : "";
    const threadBody = ordered.length ? ordered.map((m) => {
      try {
      const day = dateSeparatorLabel(m.createdAt, nowMs);
      const separator = day && day !== lastDay ? (lastDay = day, '<div class="day-sep">' + esc(day) + '</div>') : "";
      const mine = !!(state.user && m.senderId === state.user.id);
      const failed = m.sendState === "failed";
      const deleted = !!m.deletedForEveryone;
      const receipt = !mine ? "" : failed
        ? '<span class="receipt fail" role="img" aria-label="Failed to send">!</span>'
        : m.sendState === "pending"
          ? '<span class="receipt" role="img" aria-label="Waiting to send">○</span>'
          : m.sendState === "sending"
          ? '<span class="receipt" role="img" aria-label="Sending">○</span>'
          : m.status === "READ"
            ? '<span class="receipt read" role="img" aria-label="Read">✓✓</span>'
            : m.status === "DELIVERED"
              ? '<span class="receipt" role="img" aria-label="Delivered">✓✓</span>'
              : '<span class="receipt" role="img" aria-label="Sent">✓</span>';
      const clientMessageId = String(m.id || "").indexOf("local-") === 0 ? String(m.id).slice(6) : "";
      const retry = failed && clientMessageId ? '<button class="btn" type="button" data-act="retry-outbox" data-id="' + esc(clientMessageId) + '">Retry</button>' : "";
      const actions = m.id && String(m.id).indexOf("local-") !== 0
        ? '<button class="btn quiet icon-btn" type="button" data-act="message-menu" data-id="' + esc(m.id) + '" aria-label="Message actions">⋯</button>'
        : "";
      const menu = openMenuId === m.id
        ? '<div class="msg-menu">' + (!deleted ? '<button class="btn" type="button" data-act="react-menu" data-id="' + esc(m.id) + '">React</button>' : "") + (mine && !deleted ? '<button class="btn danger" type="button" data-act="delete-everyone" data-id="' + esc(m.id) + '">Delete for everyone</button>' : "") + '<button class="btn" type="button" data-act="delete-me" data-id="' + esc(m.id) + '">Delete for me</button></div>'
        : "";
      const attachmentNames = (m.attachments || []).map((file) => file.name || "");
      const files = (m.attachments || []).map((file) => {
        const kind = fileKind(file.mime);
        const label = fileTypeLabel(file.mime, file.name || "");
        const save = file.key ? '<button class="btn" type="button" data-act="save-attachment" data-id="' + esc(m.id) + '" data-file="' + esc(file.id) + '" aria-label="Save ' + esc(file.name || label) + '">Save</button>' : "";
        if (kind === "image") {
          if (file.preview) {
            const uploading = m.sendState === "sending" ? '<span class="upload-bar" role="status" aria-label="Uploading"></span>' : "";
            return '<div class="image-frame"><button class="image-bubble" type="button" data-act="open-preview" data-id="' + esc(file.id) + '" data-message="' + esc(m.id) + '" data-name="' + esc(file.name) + '" aria-label="Open image ' + esc(file.name || "attachment") + '"><img src="' + esc(file.preview) + '" alt="' + esc(file.name || "Image") + '"></button>' + uploading + '</div>';
          }
          if (file.loadError) {
            return '<div class="image-error"><span>' + esc(file.loadDetail || "Couldn't load this image.") + '</span><button class="btn" type="button" data-act="reload-image" data-id="' + esc(m.id) + '" data-file="' + esc(file.id) + '">Try again</button></div>';
          }
          return '<div class="image-bubble loading" role="status" aria-label="Loading image"></div>';
        }
        if (kind === "video") {
          const player = file.preview
            ? '<video controls preload="none" playsinline src="' + esc(file.preview) + '" aria-label="' + esc(file.name || "Video") + '"></video>'
            : (file.key
              ? '<button class="video-play" type="button" data-act="save-attachment" data-id="' + esc(m.id) + '" data-file="' + esc(file.id) + '" aria-label="Save video ' + esc(file.name || "attachment") + '">▶</button>'
              : '<span class="video-play" aria-hidden="true">▶</span>');
          return '<div class="video-card"><div class="video-stage" role="group" aria-label="Video ' + esc(file.name || "") + '">' + player + '</div><div class="file-copy"><span class="file-name" title="' + esc(file.name || "Video") + '">' + esc(file.name || "Video") + '</span><span class="muted">' + esc(label + (file.size ? " · " + fileSize(file.size) : "")) + '</span></div>' + save + '</div>';
        }
        const glyph = label === "PDF" ? "📕" : label === "Audio" ? "🎵" : label === "Archive" ? "🗜️" : "📄";
        return '<div class="file-card"><span class="file-glyph" aria-hidden="true">' + glyph + '</span><span class="file-copy"><span class="file-name" title="' + esc(file.name || label) + '">' + esc(file.name || label) + '</span><span class="muted">' + esc(label + (file.size ? " · " + fileSize(file.size) : "")) + '</span></span>' + save + '</div>';
      }).join("");
      const caption = deleted ? "" : attachmentCaption(m.displayText, attachmentNames);
      const body = deleted ? "" : ((m.attachments || []).length ? (caption ? '<div class="msg-caption">' + esc(caption) + '</div>' : "") : (m.displayText ? esc(m.displayText) : ""));
      const retryFiles = (m.attachments || []).length && m.id.indexOf("local-") === 0
        ? '<button class="btn" type="button" data-act="retry-files" data-id="' + esc(m.id) + '">Retry</button>'
        : retry;
      const sticker = !deleted && m.media && m.media.kind === "sticker" ? (stickerCatalog.find((item) => item.id === m.media.id) || null) : null;
      const gif = !deleted && m.media && m.media.kind === "gif" ? (gifCatalog.find((item) => item.id === m.media.id) || null) : null;
      const visual = sticker
        ? '<div class="sticker-bubble" role="img" aria-label="Sticker ' + esc(sticker.name) + '">' + sticker.svg + '</div>'
        : gif
          ? '<div class="motion ' + esc(gif.motion) + '" role="img" aria-label="GIF ' + esc(gif.name) + '"><i></i></div>'
          : (m.media && !deleted ? '<div class="file-card"><span class="file-name">' + esc(m.media.kind === "gif" ? "GIF unavailable" : "Sticker unavailable") + '</span></div>' : "");
      const shownBody = m.media ? "" : body;
      const groups = {};
      (m.reactions || []).forEach((mark) => {
        if (!groups[mark.emoji]) groups[mark.emoji] = [];
        if (groups[mark.emoji].indexOf(mark.userId) < 0) groups[mark.emoji].push(mark.userId);
      });
      const selfId = state.user ? state.user.id : "";
      const reactButtons = Object.keys(groups).map((emoji) => {
        const users = groups[emoji];
        const mineReaction = users.indexOf(selfId) >= 0;
        const names = users.map((id) => id === selfId ? "You" : "Friend").join(", ");
        const label = users.length > 1 ? emoji + " " + users.length : emoji;
        return '<button class="btn react-chip' + (mineReaction ? " mine" : "") + '" type="button" data-act="react" data-id="' + esc(m.id) + '" data-emoji="' + esc(emoji) + '" title="' + esc(names) + '" aria-label="' + esc(label + (mineReaction ? ", your reaction" : "")) + '">' + label + '</button>';
      }).join("");
      const canReact = !deleted && m.id && String(m.id).indexOf("local-") !== 0;
      const reactBar = canReact
        ? '<div class="react-bar" role="toolbar" aria-label="Quick reactions">' + quickReactions.map((emoji) => '<button class="btn' + ((groups[emoji] || []).indexOf(selfId) >= 0 ? " mine" : "") + '" type="button" data-act="react" data-id="' + esc(m.id) + '" data-emoji="' + esc(emoji) + '" aria-label="React with ' + esc(emoji) + '">' + emoji + '</button>').join("") + '<button class="btn" type="button" data-act="emoji-picker" data-id="' + esc(m.id) + '" aria-label="More emoji">☺</button></div>'
        : "";
      const media = !deleted && ((m.attachments || []).length || m.media) ? " media" : "";
      const flash = state.highlightMessageId && state.highlightMessageId === m.id ? " flash" : "";
      return separator + '<div class="msg ' + (mine ? "mine" : "theirs") + (failed ? " failed" : "") + (deleted ? " deleted" : "") + (m.sealed ? " sealed" : "") + (reactFor === m.id ? " react-open" : "") + media + flash + '" data-msg-id="' + esc(m.id) + '">' + reactBar + (deleted ? "" : visual + files) + shownBody + (reactButtons ? '<div class="react-row">' + reactButtons + '</div>' : "") + '<div class="msg-meta">' + esc(clock(m.createdAt)) + receipt + actions + '</div>' + menu + (failed ? '<div class="msg-meta">' + esc(m.sendError || "Message failed to send.") + '</div>' + retry + retryFiles : "") + '</div>';
      } catch (ignored) {
        return '<div class="msg">' + esc(m && m.displayText ? m.displayText : "Message") + '</div>';
      }
    }).join("") : state.historyLoading
      ? '<div class="history-note muted">Loading messages…</div>'
      : (state.historyError || state.error || savedChat)
        ? '<div class="history-note"><span>' + esc(state.historyError || state.error || "Saved messages did not load.") + '</span> <button class="btn" type="button" data-act="reopen-chat">Try again</button></div>'
        : (state.historyClearedAt && state.activeConversationId && state.historyClearedAt[state.activeConversationId])
          ? '<div class="chat-empty">' + avatarMarkup({ displayName: person.name, username: person.username }, "lg") + '<strong>Chat cleared</strong><span class="muted">New messages in this conversation will show up here. The other person still has their copy.</span></div>'
          : '<div class="chat-empty">' + avatarMarkup({ displayName: person.name, username: person.username }, "lg") + '<strong>You\\'re connected with ' + esc(person.name) + '</strong><span class="muted">Start the conversation by saying hello.</span></div>';
    list.innerHTML = recoveryBanner + historyBanner + threadBody;
    if (switchedThread) {
      list.scrollTop = list.scrollHeight;
      heldNew = 0;
      olderScrollReady = false;
      window.setTimeout(() => { olderScrollReady = true; }, 200);
    } else if (olderPage) {
      list.scrollTop = previousTop + (list.scrollHeight - previousHeight);
    } else if (nearBottom || ordered.length < 2) {
      list.scrollTop = list.scrollHeight;
      heldNew = 0;
    } else {
      list.scrollTop = previousTop;
      if (ordered.length > lastMessageCount) heldNew += ordered.length - lastMessageCount;
    }
    lastMessageCount = ordered.length;
    lastNewestId = newestId;
    if (!state.highlightMessageId) lastHighlight = "";
    if (state.highlightMessageId && state.highlightMessageId !== lastHighlight) {
      lastHighlight = state.highlightMessageId;
      const target = list.querySelector('[data-msg-id="' + String(state.highlightMessageId).replace(/"/g, "") + '"]');
      if (target && target.scrollIntoView) target.scrollIntoView({ block: "center" });
    }
    paintLibrary();
    if (!state.historyLoading) olderRequestArmed = true;
    const jump = document.getElementById("jump-latest");
    jump.hidden = heldNew === 0 || !state.activeConversationId;
    jump.textContent = "↓ " + heldNew + (heldNew === 1 ? " new message" : " new messages");
    const clearNotes = document.getElementById("clear-notifications");
    if (clearNotes) {
      const hasNotes = (state.notifications || []).length > 0;
      clearNotes.disabled = !hasNotes || !!state.busy;
      clearNotes.textContent = state.busy && hasNotes ? "Clearing…" : "Clear notifications";
      if (state.busy && hasNotes) clearNotes.setAttribute("aria-busy", "true");
      else clearNotes.removeAttribute("aria-busy");
    }
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
      sendBtn.disabled = !!state.busy || (empty && pendingFiles.length === 0) || lock !== "none";
      sendBtn.textContent = state.busy && inThread ? "…" : "➤";
      sendBtn.setAttribute("aria-label", state.busy && inThread ? "Sending" : "Send");
    }
    if (composerBox instanceof HTMLTextAreaElement) composerBox.disabled = !!state.busy || lock !== "none";
    const attachBtn = document.getElementById("attach-btn");
    if (attachBtn) attachBtn.disabled = !!state.busy || lock !== "none";
    const tray = document.getElementById("attach-tray");
    if (tray) {
      tray.hidden = pendingFiles.length === 0;
      tray.innerHTML = pendingFiles.map((item, index) => {
        const visual = item.preview
          ? '<img src="' + esc(item.preview) + '" alt="">'
          : '<div class="file-glyph-box" aria-hidden="true">📄</div>';
        return '<div class="attach-card">' + visual + '<button class="btn quiet remove" type="button" data-act="remove-file" data-id="file" data-index="' + index + '" aria-label="Remove ' + esc(item.file.name) + '">×</button><span class="name">' + esc(item.file.name) + '</span><span class="size muted">' + esc(fileSize(item.file.size)) + '</span></div>';
      }).join("") + (pendingFiles.length ? '<button class="btn quiet" type="button" data-act="clear-files" data-id="files">Cancel</button>' : "");
    }
    const attachMenu = document.getElementById("attach-menu");
    const attachButton = document.getElementById("attach-btn");
    if (attachMenu) attachMenu.hidden = !attachMenuOpen;
    if (attachButton) attachButton.setAttribute("aria-expanded", attachMenuOpen ? "true" : "false");
    const skipRecovery = document.getElementById("skip-recovery");
    if (skipRecovery) skipRecovery.hidden = state.keyRecovery !== "needed";
    document.getElementById("device-list").innerHTML = (state.devices || []).length ? state.devices.map((d) =>
      '<div class="card"><strong>' + esc(d.deviceName || d.id) + '</strong><span class="muted">' + esc(d.platform || "") + '</span><button class="btn" data-act="revoke" data-id="' + esc(d.id) + '">Revoke</button></div>'
    ).join("") : '<p class="muted">No devices listed.</p>';
    document.querySelectorAll("button, input, textarea, select").forEach((el) => {
      if (el.id === "back-btn" || el.id === "thread-back" || el.id === "thread-profile" || el.id === "thread-menu" || el.id === "clear-notifications" || el.id === "send-btn" || el.id === "chat-filter" || el.id === "jump-latest" || el.id === "retry" || el.id === "dialog-ok" || el.id === "dialog-cancel" || el.id === "edit-profile" || el.id === "close-edit" || el.hasAttribute("data-go") || el.hasAttribute("data-toggle") || el.hasAttribute("data-settings") || el.hasAttribute("data-friend-tab") || el.classList.contains("toggle") || el.closest("#lightbox")) return;
      el.disabled = !!state.busy;
    });
    document.querySelectorAll(".auth-submit").forEach((btn) => {
      const label = btn.getAttribute("data-label") || "";
      const waiting = btn.getAttribute("data-waiting") || "Please wait…";
      const screen = btn.closest("[data-screen]");
      const active = !!(state.busy && screen && !screen.hidden);
      btn.textContent = active ? waiting : label;
      if (active) btn.setAttribute("aria-busy", "true");
      else btn.removeAttribute("aria-busy");
    });
    paintPicker();
    publishViewing();
  }
  function ask(text, okLabel, action, title) {
    dialogAction = action;
    const heading = document.getElementById("dialog-title");
    heading.textContent = title || "";
    heading.hidden = !title;
    document.getElementById("dialog").querySelector("[role='dialog']").setAttribute("aria-labelledby", title ? "dialog-title" : "dialog-text");
    document.getElementById("dialog-text").textContent = text;
    const ok = document.getElementById("dialog-ok");
    ok.textContent = okLabel;
    ok.classList.toggle("danger", !!title);
    document.getElementById("dialog").hidden = false;
    ok.focus();
  }
  function closeDialog() {
    dialogAction = null;
    document.getElementById("dialog").hidden = true;
  }
  document.body.addEventListener("click", (event) => {
    const raw = event.target instanceof Element ? event.target : null;
    if (emojiTarget && raw && !raw.closest("#emoji-picker") && !raw.closest("[data-act='emoji-picker']")) closeEmojiPicker();
    if (reactFor && raw && !raw.closest(".react-open") && !raw.closest("#emoji-picker") && !raw.closest("[data-act='react-menu']")) {
      reactFor = "";
      apply(state);
    }
    if (attachMenuOpen && (!raw || !raw.closest(".attach-wrap"))) {
      attachMenuOpen = false;
      const menu = document.getElementById("attach-menu");
      const button = document.getElementById("attach-btn");
      if (menu) menu.hidden = true;
      if (button) button.setAttribute("aria-expanded", "false");
    }
    if (threadMenuOpen && (!raw || (!raw.closest("#thread-menu") && !raw.closest("#thread-menu-pop")))) {
      threadMenuOpen = false;
      const menu = document.getElementById("thread-menu-pop");
      const button = document.getElementById("thread-menu");
      if (menu) menu.hidden = true;
      if (button) button.setAttribute("aria-expanded", "false");
    }
    const target = raw ? raw.closest("button, [data-toggle]") : null;
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
        const hidden = input.type === "password";
        target.textContent = hidden ? "Show" : "Hide";
        target.setAttribute("aria-label", hidden ? "Show password" : "Hide password");
      }
      return;
    }
    const go = target.getAttribute("data-go");
    if (go) { vscode.postMessage({ version: 1, type: "navigate", destination: go }); return; }
    const act = target.getAttribute("data-act");
    const id = target.getAttribute("data-id");
    if (act === "open-picker" || act === "picker-tab") {
      pickerTab = pickerTab === id ? "" : (id || "sticker");
      paintPicker();
      return;
    }
    if (act === "thread-menu") {
      threadMenuOpen = !threadMenuOpen;
      apply(state);
      if (threadMenuOpen) {
        const item = document.querySelector("#thread-menu-pop [role='menuitem']");
        if (item instanceof HTMLElement) item.focus();
      }
      return;
    }
    if (act === "add-story") {
      openStoryComposer();
      return;
    }
    if (act === "open-story") {
      const storyId = target.getAttribute("data-story") || "";
      if (storyId) vscode.postMessage({ version: 1, type: "viewStory", storyId: storyId });
      return;
    }
    if (act === "react-story") {
      const emoji = target.getAttribute("data-emoji") || "";
      const current = storyPlaylist().find((story) => story.id === id);
      if (!id || !emoji) return;
      vscode.postMessage(current && current.myReaction === emoji
        ? { version: 1, type: "clearStoryReaction", storyId: id }
        : { version: 1, type: "reactStory", storyId: id, emoji: emoji });
      return;
    }
    if (act === "menu-search" || act === "menu-media" || act === "menu-docs") {
      threadMenuOpen = false;
      apply(state);
      const pane = act === "menu-media" ? "media" : act === "menu-docs" ? "docs" : "search";
      vscode.postMessage({ version: 1, type: "openLibrary", pane: pane });
      return;
    }
    if (act === "library-retry") {
      const pane = state.threadPane === "media" || state.threadPane === "docs" ? state.threadPane : "search";
      vscode.postMessage({ version: 1, type: "openLibrary", pane: pane });
      return;
    }
    if (act === "reveal-message") {
      if (id) vscode.postMessage({ version: 1, type: "revealMessage", messageId: id });
      return;
    }
    if (act === "save-library") {
      const fileId = target.getAttribute("data-file") || "";
      if (id && fileId) vscode.postMessage({ version: 1, type: "saveLibraryFile", messageId: id, attachmentId: fileId });
      return;
    }
    if (act === "docs-sort") {
      docOrder = id === "oldest" ? "oldest" : "newest";
      paintLibrary();
      return;
    }
    if (act === "open-library-preview") {
      const image = target.querySelector("img");
      const src = image instanceof HTMLImageElement ? image.getAttribute("src") || "" : "";
      const box = document.getElementById("lightbox");
      if (box && src.indexOf("data:image/") === 0) {
        box.hidden = false;
        box.innerHTML = '<div class="viewer" role="dialog" aria-label="Media preview"><div class="viewer-top"><span class="muted">' + esc(target.getAttribute("data-name") || "Media") + '</span><button class="btn quiet" type="button" data-act="close-preview" data-id="preview">Close</button></div><img src="' + esc(src) + '" alt="' + esc(target.getAttribute("data-name") || "Media") + '" data-act="zoom-preview" data-id="preview"><div class="viewer-bar"><button class="btn" type="button" data-act="reveal-message" data-id="' + esc(id) + '">Show in chat</button></div></div>';
      } else if (id) {
        vscode.postMessage({ version: 1, type: "revealMessage", messageId: id });
      }
      return;
    }
    if (act === "clear-chat") {
      threadMenuOpen = false;
      apply(state);
      if (!state.activeConversationId) return;
      ask(
        "Clear the messages in this conversation from your chat history? This action cannot be undone.",
        "Clear chat",
        () => vscode.postMessage({ version: 1, type: "clearChat", conversationId: state.activeConversationId }),
        "Clear this chat?"
      );
      return;
    }
    if (act === "menu-block" || act === "menu-unblock") {
      const openChat = (state.conversations || []).find((item) => item.id === state.activeConversationId);
      const peerId = openChat && state.user ? (openChat.participantIds || []).find((item) => item !== state.user.id) : "";
      threadMenuOpen = false;
      apply(state);
      if (!peerId || state.busy || (state.user && peerId === state.user.id)) return;
      if (act === "menu-block") {
        ask(
          "They will no longer be able to message you or send you a friend request. This conversation and your friendship stay. Their messages stay here unless you clear the chat.",
          "Block user",
          () => vscode.postMessage({ version: 1, type: "blockUser", userId: peerId }),
          "Block this user?"
        );
      } else {
        ask(
          "They will be able to message you again if you are still friends. Unblocking does not send a new friend request.",
          "Unblock user",
          () => vscode.postMessage({ version: 1, type: "unblockUser", userId: peerId }),
          "Unblock this user?"
        );
      }
      return;
    }
    if (!act || !id) return;
    if (act === "send-media") {
      const kind = target.getAttribute("data-kind");
      if (state.activeConversationId && (kind === "sticker" || kind === "gif") && !state.busy) {
        vscode.postMessage({ version: 1, type: "sendMedia", conversationId: state.activeConversationId, kind: kind, id: id });
        pickerTab = "";
        paintPicker();
      }
      return;
    }
    if (act === "emoji-cat") {
      emojiCategory = id;
      emojiQuery = "";
      const search = document.getElementById("emoji-search");
      if (search instanceof HTMLInputElement) search.value = "";
      paintEmojiPicker();
      return;
    }
    if (act === "react-menu") {
      openMenuId = "";
      reactFor = reactFor === id ? "" : id;
      if (!reactFor) closeEmojiPicker();
      apply(state);
      const opened = document.querySelector(".msg.react-open .react-bar button");
      if (opened instanceof HTMLElement) opened.focus();
      return;
    }
    if (act === "emoji-picker") {
      if (emojiTarget === id) closeEmojiPicker();
      else openEmojiPicker(id, target);
      return;
    }
    if (act === "emoji-pick") {
      const picked = target.getAttribute("data-emoji") || "";
      if (!picked || state.busy) return;
      recentEmoji = [picked].concat(recentEmoji.filter((item) => item !== picked)).slice(0, 8);
      vscode.postMessage({ version: 1, type: "setReaction", messageId: id, emoji: picked });
      closeEmojiPicker();
      reactFor = "";
      apply(state);
      return;
    }
    if (act === "react") {
      const emoji = target.getAttribute("data-emoji") || "";
      if (!emoji || state.busy) return;
      const removing = target.classList.contains("mine");
      vscode.postMessage(removing
        ? { version: 1, type: "clearReaction", messageId: id }
        : { version: 1, type: "setReaction", messageId: id, emoji: emoji });
      reactFor = "";
      closeEmojiPicker();
      apply(state);
      return;
    }
    if (state.busy && act !== "open-preview" && act !== "save-attachment" && act !== "reload-image" && act !== "retry-files" && act !== "close-preview") return;
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
    if (act === "load-older") vscode.postMessage({ version: 1, type: "loadOlderMessages" });
    if (act === "reopen-chat" && state.activeConversationId) vscode.postMessage({ version: 1, type: "openConversation", conversationId: state.activeConversationId });
    if (act === "open-note") vscode.postMessage({ version: 1, type: "openNotification", notificationId: id });
    if (act === "revoke") vscode.postMessage({ version: 1, type: "revokeDevice", deviceId: id });
    if (act === "message-menu") {
      openMenuId = openMenuId === id ? "" : id;
      apply(state);
      return;
    }
    if (act === "delete-me" || act === "delete-everyone") {
      const everyone = act === "delete-everyone";
      openMenuId = "";
      ask(
        everyone
          ? "This message will be replaced with \\"This message was deleted\\" for all participants in this conversation."
          : "This message will be hidden from your chat. The other person will still see it.",
        everyone ? "Delete for everyone" : "Delete for me",
        () => vscode.postMessage({ version: 1, type: "deleteMessage", messageId: id, scope: everyone ? "everyone" : "me" })
      );
      return;
    }
    if (act === "toggle-attach") {
      attachMenuOpen = !attachMenuOpen;
      apply(state);
      return;
    }
    if (act === "pick-files") {
      const input = document.getElementById("file-input");
      const kind = id;
      attachMenuOpen = false;
      const menu = document.getElementById("attach-menu");
      const button = document.getElementById("attach-btn");
      if (menu) menu.hidden = true;
      if (button) button.setAttribute("aria-expanded", "false");
      if (input instanceof HTMLInputElement) {
        input.accept = kind === "image"
          ? "image/png,image/jpeg,image/gif,image/webp"
          : kind === "document"
            ? ".pdf,.zip,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.json,.md"
            : "";
        input.click();
      }
      return;
    }
    if (act === "clear-files") {
      pendingFiles = [];
      apply(state);
      return;
    }
    if (act === "remove-file") {
      pendingFiles.splice(Number(target.getAttribute("data-index")), 1);
      apply(state);
      return;
    }
    if (act === "close-preview") {
      const box = document.getElementById("lightbox");
      if (box) box.hidden = true;
      return;
    }
    if (act === "reload-image") {
      vscode.postMessage({ version: 1, type: "reloadImage", messageId: id, attachmentId: target.getAttribute("data-file") || "" });
      return;
    }
    if (act === "save-attachment") {
      vscode.postMessage({ version: 1, type: "saveAttachment", messageId: id, attachmentId: target.getAttribute("data-file") || "" });
      return;
    }
    if (act === "open-preview") {
      const image = target.querySelector("img");
      const src = image instanceof HTMLImageElement ? image.getAttribute("src") || "" : "";
      const box = document.getElementById("lightbox");
      if (box && src) {
        box.hidden = false;
        box.innerHTML = '<div class="viewer" role="dialog" aria-label="Image preview"><div class="viewer-top"><span class="muted">' + esc(target.getAttribute("data-name") || "Image") + '</span><button class="btn quiet" type="button" data-act="close-preview" data-id="preview">Close</button></div><img src="' + esc(src) + '" alt="' + esc(target.getAttribute("data-name") || "Image") + '" data-act="zoom-preview" data-id="preview"><div class="viewer-bar"><button class="btn" type="button" data-act="save-attachment" data-id="' + esc(target.getAttribute("data-message") || "") + '" data-file="' + esc(id) + '">Save</button></div></div>';
      }
      return;
    }
    if (act === "zoom-preview") {
      const viewer = target.closest(".viewer");
      if (viewer) viewer.classList.toggle("zoomed");
      return;
    }
    if (act === "download-file") {
      vscode.postMessage({ version: 1, type: "downloadFile", id: target.getAttribute("data-id") || "", name: target.getAttribute("data-name") || "download", key: target.getAttribute("data-key") || "", iv: target.getAttribute("data-iv") || "" });
      return;
    }
    if (act === "retry-files") {
      vscode.postMessage({ version: 1, type: "retryFiles", localId: target.getAttribute("data-id") || "" });
      return;
    }
    if (act === "retry-outbox") {
      vscode.postMessage({ version: 1, type: "retryOutbox", clientMessageId: id });
      return;
    }
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
  document.getElementById("library-back").addEventListener("click", () => vscode.postMessage({ version: 1, type: "closeLibrary" }));
  document.getElementById("story-scroll-left").addEventListener("click", () => {
    const scroller = document.getElementById("story-scroller");
    if (scroller) scroller.scrollBy({ left: -180 });
  });
  document.getElementById("story-scroll-right").addEventListener("click", () => {
    const scroller = document.getElementById("story-scroller");
    if (scroller) scroller.scrollBy({ left: 180 });
  });
  document.getElementById("story-scroller").addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      document.getElementById("story-scroller").scrollBy({ left: event.key === "ArrowRight" ? 180 : -180 });
    }
  });
  document.getElementById("story-cancel").addEventListener("click", () => { document.getElementById("story-composer").hidden = true; });
  document.getElementById("story-pick").addEventListener("click", () => document.getElementById("story-file").click());
  document.getElementById("story-clear-media").addEventListener("click", () => {
    storyFile = null;
    const preview = document.getElementById("story-preview");
    if (preview) preview.textContent = "Choose a photo or a video up to 15 seconds.";
    document.getElementById("story-clear-media").hidden = true;
  });
  document.getElementById("story-file").addEventListener("change", async (event) => {
    const input = event.target;
    const file = input instanceof HTMLInputElement && input.files ? input.files[0] : undefined;
    if (input instanceof HTMLInputElement) input.value = "";
    const error = document.getElementById("story-form-error");
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp", "video/mp4", "video/webm"];
    const video = file.type.indexOf("video/") === 0;
    const limit = video ? 8388608 : 5242880;
    if (allowed.indexOf(file.type) < 0 || file.size <= 0 || file.size > limit) {
      if (error) { error.hidden = false; error.textContent = "Use a JPEG, PNG, GIF, WebP, MP4, or WebM within the size limit."; }
      return;
    }
    if (video) {
      const duration = await new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const probe = document.createElement("video");
        probe.preload = "metadata";
        probe.onloadedmetadata = () => { const value = probe.duration; URL.revokeObjectURL(url); resolve(value); };
        probe.onerror = () => { URL.revokeObjectURL(url); resolve(NaN); };
        probe.src = url;
      });
      if (!(duration > 0) || duration > 15) {
        if (error) { error.hidden = false; error.textContent = "Videos must be 15 seconds or shorter."; }
        return;
      }
    }
    storyFile = file;
    if (error) error.hidden = true;
    const preview = document.getElementById("story-preview");
    const url = URL.createObjectURL(file);
    if (preview) preview.innerHTML = video ? '<video src="' + url + '" controls></video>' : '<img src="' + url + '" alt="Story preview">';
    document.getElementById("story-clear-media").hidden = false;
  });
  document.getElementById("story-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const error = document.getElementById("story-form-error");
    if (!storyFile || storySubmitLock || state.busy) {
      if (error && !storyFile) { error.hidden = false; error.textContent = "Choose an image or a short video."; }
      return;
    }
    storySubmitLock = true;
    const style = document.querySelector('input[name="story-style"]:checked');
    const caption = document.getElementById("story-caption");
    const reader = new FileReader();
    reader.onload = () => {
      const raw = typeof reader.result === "string" ? reader.result : "";
      const data = raw.indexOf(",") >= 0 ? raw.split(",")[1] : "";
      const clientStoryId = ("story" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10)).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
      vscode.postMessage({
        version: 1,
        type: "publishStory",
        clientStoryId: clientStoryId,
        caption: caption instanceof HTMLInputElement ? caption.value : "",
        textStyle: style instanceof HTMLInputElement ? style.value : "plain",
        contentType: storyFile.type,
        dataBase64: data,
      });
    };
    reader.onerror = () => {
      storySubmitLock = false;
      if (error) { error.hidden = false; error.textContent = "That file could not be read."; }
    };
    reader.readAsDataURL(storyFile);
  });
  document.getElementById("story-close").addEventListener("click", () => vscode.postMessage({ version: 1, type: "closeStory" }));
  document.getElementById("story-prev").addEventListener("click", () => moveStory(-1));
  document.getElementById("story-next").addEventListener("click", () => moveStory(1));
  document.getElementById("story-media").addEventListener("click", (event) => {
    if (!state.storyViewer || event.target instanceof HTMLVideoElement) return;
    const rect = event.currentTarget.getBoundingClientRect();
    moveStory(event.clientX - rect.left < rect.width / 2 ? -1 : 1);
  });
  document.getElementById("story-reply-text").addEventListener("focus", () => { storyPaused = true; window.clearTimeout(storyTimer); });
  document.getElementById("story-reply-text").addEventListener("blur", () => { storyPaused = false; armStoryTimer(); });
  document.getElementById("story-reply").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = document.getElementById("story-reply-text");
    const text = input instanceof HTMLInputElement ? input.value.trim() : "";
    const current = storyPlaylist().find((story) => state.storyViewer && story.id === state.storyViewer.storyId);
    if (!text || !current || current.mine) return;
    vscode.postMessage({ version: 1, type: "replyToStory", ownerId: current.ownerId, storyId: current.id, text: text });
    if (input instanceof HTMLInputElement) input.value = "";
  });
  document.getElementById("story-viewers-btn").addEventListener("click", () => {
    const list = document.getElementById("story-viewer-list");
    if (list) list.hidden = !list.hidden;
    if (state.storyViewer) vscode.postMessage({ version: 1, type: "loadStoryViewers", storyId: state.storyViewer.storyId });
  });
  document.getElementById("story-delete").addEventListener("click", () => {
    if (!state.storyViewer) return;
    const storyId = state.storyViewer.storyId;
    ask("Delete this story? People will no longer be able to view it.", "Delete", () => vscode.postMessage({ version: 1, type: "deleteStory", storyId: storyId }), "Delete this story?");
  });
  document.getElementById("search-input").addEventListener("input", (event) => {
    const value = event.target instanceof HTMLInputElement ? event.target.value : "";
    window.clearTimeout(libraryQueryTimer);
    libraryQueryTimer = window.setTimeout(() => {
      libraryQuery = value;
      searchIndex = 0;
      paintLibrary();
    }, 250);
  });
  document.getElementById("search-clear").addEventListener("click", () => {
    libraryQuery = "";
    searchIndex = 0;
    const input = document.getElementById("search-input");
    if (input instanceof HTMLInputElement) {
      input.value = "";
      input.focus();
    }
    paintLibrary();
  });
  document.getElementById("search-prev").addEventListener("click", () => moveSearch(-1));
  document.getElementById("search-next").addEventListener("click", () => moveSearch(1));
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
  document.addEventListener("keydown", (event) => {
    const storyOpen = state.storyViewer && document.getElementById("story-viewer") && !document.getElementById("story-viewer").hidden;
    const typingReply = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
    if (storyOpen && !typingReply && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
      event.preventDefault();
      moveStory(event.key === "ArrowRight" ? 1 : -1);
      return;
    }
    if (threadMenuOpen && (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End")) {
      const items = Array.prototype.slice.call(document.querySelectorAll("#thread-menu-pop [role='menuitem']"));
      if (!items.length) return;
      event.preventDefault();
      const current = items.indexOf(document.activeElement);
      const next = event.key === "Home" ? 0
        : event.key === "End" ? items.length - 1
          : event.key === "ArrowDown" ? (current < 0 ? 0 : (current + 1) % items.length)
            : (current <= 0 ? items.length - 1 : current - 1);
      if (items[next]) items[next].focus();
      return;
    }
    if (event.key !== "Escape") return;
    const storyViewer = document.getElementById("story-viewer");
    const storyComposer = document.getElementById("story-composer");
    if (storyViewer && !storyViewer.hidden) {
      vscode.postMessage({ version: 1, type: "closeStory" });
      return;
    }
    if (storyComposer && !storyComposer.hidden) {
      storyComposer.hidden = true;
      return;
    }
    if (emojiTarget) {
      closeEmojiPicker();
      reactFor = "";
      apply(state);
      return;
    }
    const box = document.getElementById("lightbox");
    if (box && !box.hidden) {
      box.hidden = true;
      return;
    }
    if (attachMenuOpen) {
      attachMenuOpen = false;
      apply(state);
      return;
    }
    if (threadMenuOpen) {
      threadMenuOpen = false;
      apply(state);
      return;
    }
    if ((state.threadPane || "chat") !== "chat" && state.screen === "messages") {
      vscode.postMessage({ version: 1, type: "closeLibrary" });
    }
    if (!document.getElementById("dialog").hidden) closeDialog();
  });
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
  document.getElementById("recovery-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const passphrase = String(new FormData(e.target).get("passphrase") || "");
    vscode.postMessage({ version: 1, type: "saveRecovery", passphrase });
    e.target.reset();
  });
  document.getElementById("restore-recovery").addEventListener("click", () => {
    const input = document.querySelector("#recovery-form input[name=passphrase]");
    vscode.postMessage({ version: 1, type: "restoreRecovery", passphrase: input ? input.value : "" });
  });
  document.getElementById("skip-recovery").addEventListener("click", () => {
    vscode.postMessage({ version: 1, type: "skipRecovery" });
  });
  const riskyExt = new Set(["exe", "bat", "cmd", "com", "msi", "dll", "scr", "ps1", "vbs", "js", "jar", "apk", "sh", "hta"]);
  function addPending(fileList) {
    for (const file of fileList) {
      if (pendingFiles.length >= 10) break;
      if (!file || file.size < 1 || file.size > 10485760) {
        state = { ...state, error: "Each file must be between 1 byte and 10 MB." };
        apply(state);
        return;
      }
      const item = { file, preview: "" };
      pendingFiles.push(item);
      if (file.type && file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = () => {
          item.preview = typeof reader.result === "string" ? reader.result : "";
          apply(state);
        };
        reader.readAsDataURL(file);
      }
    }
    apply(state);
  }
  document.getElementById("file-input").addEventListener("change", (event) => {
    const input = event.target;
    if (input instanceof HTMLInputElement && input.files) addPending(input.files);
    if (input instanceof HTMLInputElement) input.value = "";
  });
  const threadDrop = document.getElementById("thread");
  threadDrop.addEventListener("dragover", (event) => event.preventDefault());
  threadDrop.addEventListener("drop", (event) => {
    event.preventDefault();
    if (event.dataTransfer && event.dataTransfer.files) addPending(event.dataTransfer.files);
  });
  document.getElementById("lightbox").addEventListener("click", (event) => {
    const box = document.getElementById("lightbox");
    if (event.target === box) {
      box.hidden = true;
      return;
    }
    const target = event.target instanceof HTMLElement ? event.target.closest("[data-act='zoom-preview']") : null;
    const viewer = target instanceof HTMLElement ? target.closest(".viewer") : null;
    if (viewer) viewer.classList.toggle("zoomed");
  });
  document.getElementById("gif-query").addEventListener("keydown", (event) => {
    if (event.key === "Enter") event.preventDefault();
  });
  document.getElementById("gif-query").addEventListener("input", (event) => {
    gifQuery = event.target && event.target.value ? event.target.value : "";
    paintPicker();
  });
  document.getElementById("emoji-search").addEventListener("input", (event) => {
    emojiQuery = event.target && event.target.value ? event.target.value : "";
    paintEmojiPicker();
  });
  document.getElementById("emoji-picker").addEventListener("keydown", (event) => {
    const keys = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"];
    if (keys.indexOf(event.key) < 0) return;
    const buttons = Array.prototype.slice.call(document.querySelectorAll("#emoji-grid button"));
    const index = buttons.indexOf(document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : event.key === "ArrowDown" ? 8 : -8;
    const next = buttons[Math.max(0, Math.min(buttons.length - 1, index + step))];
    if (next) next.focus();
  });
  document.getElementById("message-form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!state.activeConversationId || state.busy) return;
    const box = e.target.querySelector("textarea");
    const text = box instanceof HTMLTextAreaElement ? box.value.trim() : "";
    if (pendingFiles.length) {
      const risky = pendingFiles.some((item) => riskyExt.has((item.file.name.split(".").pop() || "").toLowerCase()));
      const sendSelected = (confirmedRisky) => {
        const files = pendingFiles.slice();
        pendingFiles = [];
        apply(state);
        Promise.all(files.map((item) => new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = typeof reader.result === "string" ? reader.result : "";
            resolve({ name: item.file.name, mime: item.file.type || "application/octet-stream", base64: (result.split(",")[1] || "") });
          };
          reader.readAsDataURL(item.file);
        }))).then((encoded) => {
          vscode.postMessage({ version: 1, type: "sendFiles", conversationId: state.activeConversationId, text, confirmedRisky, files: encoded });
        });
      };
      if (risky) {
        ask("This file can run code if someone opens it. Send it only if you trust it.", "Send anyway", () => sendSelected(true));
        return;
      }
      sendSelected(false);
      if (box instanceof HTMLTextAreaElement) box.value = "";
      return;
    }
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
  document.getElementById("message-list").addEventListener("scroll", () => {
    const list = document.getElementById("message-list");
    if (!olderRequestArmed || !olderScrollReady) return;
    if (!shouldLoadOlderHistory({
      hasMore: state.historyHasMore === true,
      loading: state.historyLoading === true,
      scrollTop: list.scrollTop,
      scrollHeight: list.scrollHeight,
      clientHeight: list.clientHeight,
    })) return;
    olderRequestArmed = false;
    vscode.postMessage({ version: 1, type: "loadOlderMessages" });
  });
  document.getElementById("retry").addEventListener("click", () => vscode.postMessage({ version: 1, type: "retry" }));
  document.getElementById("read-all").addEventListener("click", () => vscode.postMessage({ version: 1, type: "markAllNotificationsRead" }));
  document.getElementById("clear-notifications").addEventListener("click", () => {
    const button = document.getElementById("clear-notifications");
    if (button.disabled) return;
    ask(
      "This will remove all your notifications from your notification history. This action cannot be undone.",
      "Clear all",
      () => vscode.postMessage({ version: 1, type: "clearNotifications" }),
      "Clear all notifications?"
    );
  });
  document.getElementById("resend-verify").addEventListener("click", () => vscode.postMessage({ version: 1, type: "resendVerification" }));
  document.getElementById("logout-btn").addEventListener("click", () => vscode.postMessage({ version: 1, type: "logout" }));
  window.addEventListener("message", (event) => { if (isState(event.data)) apply(event.data); });
  document.addEventListener("visibilitychange", () => publishViewing());
  window.addEventListener("focus", () => publishViewing());
  window.addEventListener("blur", () => publishViewing());
  function refreshAtMidnight() {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    window.setTimeout(() => { apply(state); refreshAtMidnight(); }, Math.max(1000, next.getTime() - now.getTime()));
  }
  refreshAtMidnight();
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
    messages: state.messages.map((message) => ({
      ...message,
      attachments: message.attachments?.map((file) => ({ ...file })),
    })),
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
    friendsPanelSeq: state.friendsPanelSeq,
    unreadByConversation: { ...(state.unreadByConversation || {}) },
    conversationPreviews: { ...(state.conversationPreviews || {}) },
    presenceByUser: { ...(state.presenceByUser || {}) },
    typing: state.typing,
    historyHasMore: state.historyHasMore === true,
    historyLoading: state.historyLoading === true,
    historyError: state.historyError ?? null,
    keyRecovery: state.keyRecovery || "ready",
    historyClearedAt: { ...(state.historyClearedAt || {}) },
    threadPane: state.threadPane || "chat",
    libraryConversationId: state.libraryConversationId ?? null,
    libraryLoading: state.libraryLoading === true,
    libraryError: state.libraryError ?? null,
    libraryComplete: state.libraryComplete !== false,
    highlightMessageId: state.highlightMessageId ?? null,
    storiesLoading: state.storiesLoading === true,
    storiesError: state.storiesError ?? null,
    storyTray: {
      mine: [...(state.storyTray?.mine || [])],
      rings: (state.storyTray?.rings || []).map((ring) => ({ ...ring, stories: [...ring.stories] })),
    },
    storyViewer: state.storyViewer ?? null,
    storyStage: state.storyStage ?? null,
    storyViewers: [...(state.storyViewers || [])],
    library: (state.library || []).map((entry) => ({
      ...entry,
      files: entry.files.map((file) => ({ ...file })),
    })),
  };
}
