export interface SharedFile {
  readonly id: string;
  readonly name: string;
  readonly size: number;
  readonly mime: string;
  readonly key: string;
  readonly iv: string;
  readonly preview?: string;
  readonly loadError?: boolean;
  readonly loadDetail?: string;
}

export interface FilePayload {
  readonly text: string;
  readonly files: readonly SharedFile[];
}

const MARKER = "file-v1";

export function encodeFilePayload(text: string, files: readonly SharedFile[]): string {
  return JSON.stringify({
    devconnect: MARKER,
    text,
    files: files.map((file) => ({
      id: file.id,
      name: file.name,
      size: file.size,
      mime: file.mime,
      key: file.key,
      iv: file.iv,
    })),
  });
}

export function parseFilePayload(value: string): FilePayload | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== "object" || (parsed as { devconnect?: unknown }).devconnect !== MARKER) {
    return undefined;
  }
  const body = parsed as { text?: unknown; files?: unknown };
  if (typeof body.text !== "string" || !Array.isArray(body.files) || body.files.length < 1 || body.files.length > 10) {
    return undefined;
  }
  const files: SharedFile[] = [];
  for (const item of body.files) {
    if (!item || typeof item !== "object") return undefined;
    const file = item as Record<string, unknown>;
    if (typeof file.id !== "string" || typeof file.name !== "string" || typeof file.mime !== "string"
      || typeof file.key !== "string" || typeof file.iv !== "string" || typeof file.size !== "number") {
      return undefined;
    }
    files.push({
      id: file.id,
      name: file.name.replace(/[\\/]/g, "_").slice(0, 180),
      size: file.size,
      mime: file.mime.slice(0, 120),
      key: file.key,
      iv: file.iv,
    });
  }
  return { text: body.text, files };
}

const BLOCKED = new Set(["exe", "bat", "cmd", "com", "msi", "dll", "scr", "ps1", "vbs", "js", "jar", "apk", "sh", "hta"]);

export function isRiskyFile(name: string): boolean {
  const extension = name.toLowerCase().split(".").pop() ?? "";
  return BLOCKED.has(extension);
}
