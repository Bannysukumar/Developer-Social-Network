import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "fs";
import { dirname, join, relative, resolve } from "path";
import { ApiError, isTransientFailure } from "../api/errors";

export type OutboxKind = "text" | "media" | "files";

export interface OutboxFileRef {
  readonly name: string;
  readonly mime: string;
  readonly relativePath: string;
}

export interface OutboxRecord {
  readonly accountId: string;
  readonly conversationId: string;
  readonly clientMessageId: string;
  readonly kind: OutboxKind;
  readonly createdAt: string;
  readonly attempts: number;
  readonly nextAttemptAt: number;
  readonly permanent: boolean;
  readonly displayText: string;
  readonly plaintext?: string;
  readonly media?: { readonly kind: "sticker" | "gif"; readonly id: string };
  readonly caption?: string;
  readonly ciphertext?: string;
  readonly messageType?: "TEXT" | "IMAGE" | "FILE";
  readonly deviceId?: string;
  readonly keyId?: string;
  readonly attachmentIds?: readonly string[];
  readonly files?: readonly OutboxFileRef[];
  readonly error?: string;
}

export interface OutboxStore {
  list(accountId: string): OutboxRecord[];
  save(record: OutboxRecord): void;
  remove(accountId: string, clientMessageId: string): void;
  writeFile(accountId: string, clientMessageId: string, index: number, bytes: Uint8Array): string;
  readFile(accountId: string, relativePath: string): Uint8Array | undefined;
}

/** Stable id accepted by the server idempotency key: 8 to 64 letters, digits, "_" or "-". */
export function createClientMessageId(now = Date.now(), random: () => number = Math.random): string {
  const suffix = Math.floor(random() * 1_000_000_000).toString(36).padStart(6, "0");
  return `ext-${now}-${suffix}`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
}

/** 1s, 2s, 4s, 8s, 16s, then 30s, plus a small jitter so retries do not stampede. */
export function nextAttemptDelay(attempt: number, random: () => number = Math.random): number {
  const step = Math.max(0, Math.floor(attempt));
  const base = Math.min(30_000, 1_000 * 2 ** Math.min(step, 5));
  return base + Math.floor(random() * Math.min(1_000, Math.floor(base / 4) + 1));
}

/** A rejection that will not succeed by trying the same payload again. */
export function isPermanentDeliveryError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (isTransientFailure(error) || error.status === 401 || error.status === 408 || error.status === 429) return false;
  return error.kind === "configuration" || error.kind === "request" || error.status === 400 || error.status === 403 || error.status === 404 || error.status === 413 || error.status === 415;
}

function safeAccount(accountId: string): string {
  const safe = accountId.replace(/[^A-Za-z0-9_-]/g, "");
  if (safe.length < 1) throw new Error("Invalid account id");
  return safe;
}

function isRecord(value: unknown): value is OutboxRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as OutboxRecord;
  return typeof record.accountId === "string"
    && typeof record.conversationId === "string"
    && typeof record.clientMessageId === "string"
    && (record.kind === "text" || record.kind === "media" || record.kind === "files")
    && typeof record.createdAt === "string"
    && typeof record.displayText === "string";
}

export class MemoryOutbox implements OutboxStore {
  private readonly records: OutboxRecord[] = [];
  private readonly files = new Map<string, Uint8Array>();

  list(accountId: string): OutboxRecord[] {
    return this.records.filter((item) => item.accountId === accountId).map((item) => ({ ...item }));
  }

  save(record: OutboxRecord): void {
    const index = this.records.findIndex((item) => item.accountId === record.accountId && item.clientMessageId === record.clientMessageId);
    if (index >= 0) this.records[index] = { ...record };
    else this.records.push({ ...record });
  }

  remove(accountId: string, clientMessageId: string): void {
    const index = this.records.findIndex((item) => item.accountId === accountId && item.clientMessageId === clientMessageId);
    if (index >= 0) this.records.splice(index, 1);
    for (const key of [...this.files.keys()]) {
      if (key.startsWith(`${accountId}/${clientMessageId}/`)) this.files.delete(key);
    }
  }

  writeFile(accountId: string, clientMessageId: string, index: number, bytes: Uint8Array): string {
    const relativePath = `${safeAccount(accountId)}/${clientMessageId}/${index}`;
    this.files.set(relativePath, new Uint8Array(bytes));
    return relativePath;
  }

  readFile(accountId: string, relativePath: string): Uint8Array | undefined {
    if (!relativePath.startsWith(`${safeAccount(accountId)}/`)) return undefined;
    const bytes = this.files.get(relativePath);
    return bytes ? new Uint8Array(bytes) : undefined;
  }
}

export class FileOutbox implements OutboxStore {
  constructor(private readonly root: string) {}

  list(accountId: string): OutboxRecord[] {
    const path = this.queuePath(accountId);
    let raw: string;
    try {
      raw = readFileSync(path, "utf8");
    } catch {
      return [];
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) throw new Error("queue");
      return parsed.filter(isRecord).filter((item) => item.accountId === accountId);
    } catch {
      try {
        renameSync(path, `${path}.corrupt`);
      } catch {
        // Keep the unreadable file in place when it cannot be renamed.
      }
      return [];
    }
  }

  save(record: OutboxRecord): void {
    const current = this.list(record.accountId).filter((item) => item.clientMessageId !== record.clientMessageId);
    current.push(record);
    this.writeQueue(record.accountId, current);
  }

  remove(accountId: string, clientMessageId: string): void {
    const current = this.list(accountId).filter((item) => item.clientMessageId !== clientMessageId);
    this.writeQueue(accountId, current);
    rmSync(join(this.accountDir(accountId), "files", clientMessageId), { recursive: true, force: true });
  }

  writeFile(accountId: string, clientMessageId: string, index: number, bytes: Uint8Array): string {
    const relativePath = join("files", clientMessageId, String(index));
    const target = this.resolveInside(accountId, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    const temporary = `${target}.tmp`;
    writeFileSync(temporary, bytes);
    renameSync(temporary, target);
    return relativePath.replace(/\\/g, "/");
  }

  readFile(accountId: string, relativePath: string): Uint8Array | undefined {
    try {
      return new Uint8Array(readFileSync(this.resolveInside(accountId, relativePath)));
    } catch {
      return undefined;
    }
  }

  private accountDir(accountId: string): string {
    return join(this.root, safeAccount(accountId));
  }

  private queuePath(accountId: string): string {
    return join(this.accountDir(accountId), "queue.json");
  }

  private writeQueue(accountId: string, records: readonly OutboxRecord[]): void {
    const path = this.queuePath(accountId);
    mkdirSync(dirname(path), { recursive: true });
    const temporary = `${path}.tmp`;
    writeFileSync(temporary, JSON.stringify(records));
    renameSync(temporary, path);
  }

  private resolveInside(accountId: string, relativePath: string): string {
    const root = resolve(this.accountDir(accountId));
    const target = resolve(root, relativePath);
    const nested = relative(root, target);
    if (nested.startsWith("..") || nested === "") throw new Error("Invalid outbox path");
    return target;
  }
}
