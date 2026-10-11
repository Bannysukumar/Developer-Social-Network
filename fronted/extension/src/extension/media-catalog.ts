export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;

export const ALLOWED_REACTIONS = [...QUICK_REACTIONS, "🔥", "🎉", "👀", "💯"] as const;

export interface StickerDef {
  readonly id: string;
  readonly name: string;
  readonly pack: string;
  readonly svg: string;
}

export interface GifDef {
  readonly id: string;
  readonly name: string;
  readonly keywords: readonly string[];
  readonly motion: "pulse" | "bounce" | "spin" | "slide";
}

const mark = (body: string): string =>
  `<svg viewBox="0 0 64 64">${body}</svg>`;

export const STICKERS: readonly StickerDef[] = [
  { id: "wave", name: "Wave", pack: "Hello", svg: mark('<circle cx="32" cy="32" r="28" fill="#F4C430"/><path d="M18 34c6 8 22 8 28 0" fill="none" stroke="#1b1b1b" stroke-width="3" stroke-linecap="round"/>') },
  { id: "heart", name: "Heart", pack: "Hello", svg: mark('<path d="M32 52 12 32c-6-8 2-18 12-14 4 2 6 6 8 8 2-2 4-6 8-8 10-4 18 6 12 14Z" fill="#e85d75"/>') },
  { id: "code", name: "Code", pack: "Build", svg: mark('<rect x="6" y="10" width="52" height="44" rx="8" fill="#1d4e89"/><path d="M24 24 16 32l8 8M40 24l8 8-8 8M34 22l-4 20" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>') },
  { id: "coffee", name: "Coffee", pack: "Build", svg: mark('<rect x="14" y="18" width="28" height="26" rx="6" fill="#6f4e37"/><path d="M42 24h6a6 6 0 0 1 0 12h-6" fill="none" stroke="#6f4e37" stroke-width="3"/><path d="M22 12c2 4 2 4 0 8M32 10c2 4 2 4 0 8" fill="none" stroke="#9ad" stroke-width="2"/>') },
  { id: "bug", name: "Bug", pack: "Build", svg: mark('<ellipse cx="32" cy="36" rx="14" ry="16" fill="#3d8b6e"/><circle cx="26" cy="32" r="2" fill="#fff"/><circle cx="38" cy="32" r="2" fill="#fff"/><path d="M18 28 10 22M46 28l8-6M18 40l-8 6M46 40l8 6" stroke="#3d8b6e" stroke-width="3" stroke-linecap="round"/>') },
  { id: "ship", name: "Ship", pack: "Build", svg: mark('<path d="M8 40h48l-6 10H14Z" fill="#2457a6"/><path d="M32 14v26M32 18h14l-6 8h-8" fill="#7eb6ff" stroke="#2457a6" stroke-width="2"/>') },
];

export const GIFS: readonly GifDef[] = [
  { id: "spark", name: "Spark", keywords: ["spark", "hi", "hello", "new"], motion: "pulse" },
  { id: "bounce", name: "Bounce", keywords: ["bounce", "happy", "yes"], motion: "bounce" },
  { id: "loop", name: "Loop", keywords: ["loop", "loading", "wait"], motion: "spin" },
  { id: "pass", name: "Pass", keywords: ["pass", "send", "go"], motion: "slide" },
];

export function stickerById(id: string): StickerDef | undefined {
  return STICKERS.find((item) => item.id === id);
}

export function gifById(id: string): GifDef | undefined {
  return GIFS.find((item) => item.id === id);
}

export function searchGifs(query: string): readonly GifDef[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return GIFS;
  return GIFS.filter((item) => item.name.toLowerCase().includes(needle) || item.keywords.some((word) => word.includes(needle)));
}

export function isAllowedReaction(emoji: string): boolean {
  return (ALLOWED_REACTIONS as readonly string[]).includes(emoji);
}
