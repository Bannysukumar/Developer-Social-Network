export type FileBucket = "image" | "video" | "gif" | "file";

export interface LibraryFile {
  readonly id: string;
  readonly name: string;
  readonly mime: string;
  readonly size: number;
  readonly bucket: FileBucket;
  readonly preview?: string;
}

export interface LibraryEntry {
  readonly id: string;
  readonly conversationId: string;
  readonly senderId: string;
  readonly createdAt?: string;
  readonly text: string;
  readonly sealed: boolean;
  readonly deleted: boolean;
  readonly mediaKind?: "sticker" | "gif";
  readonly mediaId?: string;
  readonly files: readonly LibraryFile[];
}

/** Photos, videos, and GIFs are media. Everything else shared as a file is a document. */
export function fileBucket(mime: string): FileBucket {
  const value = mime.toLowerCase();
  if (value === "image/gif") return "gif";
  if (value.startsWith("image/")) return "image";
  if (value.startsWith("video/")) return "video";
  return "file";
}

export function toLibraryEntry(message: {
  id: string;
  conversationId: string;
  senderId: string;
  createdAt?: string;
  displayText?: string;
  sealed?: boolean;
  deletedForEveryone?: boolean;
  media?: { kind: "sticker" | "gif"; id: string };
  attachments?: readonly { id: string; name: string; mime: string; size: number; preview?: string }[];
}): LibraryEntry {
  const sealed = message.sealed === true;
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    createdAt: message.createdAt,
    text: sealed || message.deletedForEveryone ? "" : (message.displayText ?? ""),
    sealed,
    deleted: message.deletedForEveryone === true,
    mediaKind: message.media?.kind,
    mediaId: message.media?.id,
    files: sealed ? [] : (message.attachments ?? []).map((file) => ({
      id: file.id,
      name: file.name,
      mime: file.mime,
      size: file.size,
      bucket: fileBucket(file.mime),
      preview: file.preview,
    })),
  };
}

export function visibleLibrary(entries: readonly LibraryEntry[], conversationId: string, clearedAt?: string): LibraryEntry[] {
  return entries.filter((entry) => entry.conversationId === conversationId
    && (!clearedAt || !entry.createdAt || entry.createdAt > clearedAt));
}

export function searchEntries(entries: readonly LibraryEntry[], query: string): LibraryEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return entries.filter((entry) => {
    if (entry.sealed || entry.deleted) return false;
    if (entry.text.toLowerCase().includes(needle)) return true;
    return entry.files.some((file) => file.name.toLowerCase().includes(needle));
  });
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);
}

export function highlightMatch(text: string, query: string): string {
  const needle = query.trim();
  if (!needle) return escapeHtml(text);
  const lower = text.toLowerCase();
  const target = needle.toLowerCase();
  let html = "";
  let index = 0;
  while (index < text.length) {
    const found = lower.indexOf(target, index);
    if (found < 0) {
      html += escapeHtml(text.slice(index));
      break;
    }
    html += escapeHtml(text.slice(index, found));
    html += `<mark>${escapeHtml(text.slice(found, found + needle.length))}</mark>`;
    index = found + needle.length;
  }
  return html;
}

export function mediaEntries(entries: readonly LibraryEntry[]): LibraryEntry[] {
  return entries.filter((entry) => !entry.deleted && !entry.sealed && (
    entry.mediaKind === "gif" || entry.mediaKind === "sticker" || entry.files.some((file) => file.bucket !== "file")
  ));
}

export function documentEntries(entries: readonly LibraryEntry[]): LibraryEntry[] {
  return entries.filter((entry) => !entry.deleted && !entry.sealed && entry.files.some((file) => file.bucket === "file"));
}

export function sortByTime<T extends { createdAt?: string }>(items: readonly T[], order: "newest" | "oldest"): T[] {
  const copy = [...items];
  copy.sort((left, right) => {
    const a = left.createdAt ?? "";
    const b = right.createdAt ?? "";
    return order === "oldest" ? a.localeCompare(b) : b.localeCompare(a);
  });
  return copy;
}
