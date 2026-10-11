export function fileKind(mime: string | undefined): "image" | "video" | "file" {
  const value = mime || "";
  if (value.startsWith("image/")) return "image";
  if (value.startsWith("video/")) return "video";
  return "file";
}

export function attachmentCaption(displayText: string | undefined, names: readonly string[]): string {
  const text = (displayText || "").trim();
  const clean = names.map((name) => name.trim()).filter((name) => name.length > 0);
  if (!text) return "";
  if (clean.length === 1 && text === clean[0]) return "";
  if (clean.length > 0 && text === clean.join(", ")) return "";
  return text;
}

export function fileTypeLabel(mime: string | undefined, name: string): string {
  const kind = fileKind(mime);
  if (kind === "video") return "Video";
  if (kind === "image") return "Image";
  const lower = (mime || "").toLowerCase();
  if (lower.includes("pdf")) return "PDF";
  if (lower.startsWith("audio/")) return "Audio";
  if (lower.includes("zip") || lower.includes("compressed") || lower.includes("tar")) return "Archive";
  const dot = name.lastIndexOf(".");
  if (dot > 0 && dot < name.length - 1) return name.slice(dot + 1).toUpperCase().slice(0, 8);
  return "File";
}
