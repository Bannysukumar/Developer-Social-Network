import { gifById, stickerById } from "../media-catalog";

export interface MediaPayload {
  readonly kind: "sticker" | "gif";
  readonly id: string;
}

const MARKER = "media-v1";

export function encodeMediaPayload(kind: "sticker" | "gif", id: string): string {
  if (kind === "sticker" && !stickerById(id)) throw new Error("That sticker is not available.");
  if (kind === "gif" && !gifById(id)) throw new Error("That GIF is not available.");
  return JSON.stringify({ devconnect: MARKER, kind, id });
}

export function parseMediaPayload(value: string): MediaPayload | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== "object") return undefined;
  const body = parsed as { devconnect?: unknown; kind?: unknown; id?: unknown };
  if (body.devconnect !== MARKER || (body.kind !== "sticker" && body.kind !== "gif") || typeof body.id !== "string") {
    return undefined;
  }
  if (body.kind === "sticker" && !stickerById(body.id)) return { kind: "sticker", id: body.id };
  if (body.kind === "gif" && !gifById(body.id)) return { kind: "gif", id: body.id };
  if (body.kind === "sticker" || body.kind === "gif") return { kind: body.kind, id: body.id };
  return undefined;
}
