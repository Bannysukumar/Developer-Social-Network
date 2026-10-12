import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import type { ConversationDto } from "../shared/api-types";
import type { DisplayMessage } from "./auth-service";

export interface CachedThread {
  readonly messages: readonly DisplayMessage[];
  readonly cursor: string | null;
  readonly hasMore: boolean;
}

export interface ChatSnapshot {
  readonly conversations: readonly ConversationDto[];
  readonly threads: Readonly<Record<string, CachedThread>>;
  readonly clearedAt?: Readonly<Record<string, string>>;
}

export interface ChatCache {
  load(accountId: string): ChatSnapshot | undefined;
  save(accountId: string, snapshot: ChatSnapshot): void;
}

function safeAccount(accountId: string): string {
  const safe = accountId.replace(/[^A-Za-z0-9_-]/g, "");
  if (safe.length < 1) throw new Error("Invalid account id");
  return safe;
}

function slimMessage(message: DisplayMessage): DisplayMessage {
  if (!message.attachments) return message;
  return {
    ...message,
    attachments: message.attachments.map((file) => file.preview && file.preview.length > 256 ? { ...file, preview: undefined } : file),
  };
}

export function slimSnapshot(snapshot: ChatSnapshot): ChatSnapshot {
  const threads: Record<string, CachedThread> = {};
  for (const [id, thread] of Object.entries(snapshot.threads).slice(0, 8)) {
    threads[id] = {
      messages: thread.messages.slice(0, 50).map(slimMessage),
      cursor: thread.cursor,
      hasMore: thread.hasMore,
    };
  }
  return { conversations: snapshot.conversations.slice(0, 30), threads, clearedAt: snapshot.clearedAt };
}

export class MemoryChatCache implements ChatCache {
  private readonly snapshots = new Map<string, ChatSnapshot>();

  load(accountId: string): ChatSnapshot | undefined {
    const snapshot = this.snapshots.get(accountId);
    return snapshot ? slimSnapshot(snapshot) : undefined;
  }

  save(accountId: string, snapshot: ChatSnapshot): void {
    this.snapshots.set(accountId, slimSnapshot(snapshot));
  }
}

export class FileChatCache implements ChatCache {
  constructor(private readonly root: string) {}

  load(accountId: string): ChatSnapshot | undefined {
    try {
      const parsed = JSON.parse(readFileSync(join(this.root, safeAccount(accountId), "cache.json"), "utf8")) as ChatSnapshot;
      if (!parsed || !Array.isArray(parsed.conversations) || !parsed.threads) return undefined;
      return parsed;
    } catch {
      return undefined;
    }
  }

  save(accountId: string, snapshot: ChatSnapshot): void {
    const path = join(this.root, safeAccount(accountId), "cache.json");
    mkdirSync(dirname(path), { recursive: true });
    const temporary = `${path}.tmp`;
    writeFileSync(temporary, JSON.stringify(slimSnapshot(snapshot)));
    renameSync(temporary, path);
  }
}
