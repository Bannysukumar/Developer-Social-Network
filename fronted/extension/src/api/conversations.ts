import { z } from "zod";
import type { ApiClient } from "./client";
import { ApiError } from "./errors";
import { pathId } from "./users";
import {
  attachmentCreatedSchema,
  conversationSchema,
  createConversationRequestSchema,
  messageSchema,
  pageSchema,
  reactionSnapshotSchema,
  sendMessageRequestSchema,
  type ConversationDto,
  type MessageDto,
  type ReactionSnapshotDto,
  type SendMessageRequestDto,
} from "../shared/api-types";

const conversationPageSchema = pageSchema(conversationSchema);

export type ConversationPage = {
  readonly items: readonly ConversationDto[];
  readonly page: number;
  readonly size: number;
  readonly totalElements: number;
  readonly totalPages: number;
  readonly hasNext: boolean;
};

export type MessageCursorPage = {
  readonly items: readonly MessageDto[];
  readonly nextCursor: string | null;
  readonly hasNext: boolean;
};

const looseMessagePageSchema = z.object({
  items: z.array(z.unknown()),
  nextCursor: z.string().nullable().optional(),
  hasNext: z.boolean().optional(),
}).passthrough();

export class ConversationsApi {
  constructor(private readonly client: ApiClient) {}

  list(page = 0, size = 20): Promise<ConversationPage> {
    return this.client.request("conversations", conversationPageSchema, {
      method: "GET",
      query: { page, size },
    });
  }

  get(conversationId: string): Promise<ConversationDto> {
    return this.client.request(`conversations/${pathId(conversationId)}`, conversationSchema, {
      method: "GET",
    });
  }

  create(participantId: string): Promise<ConversationDto> {
    const body = createConversationRequestSchema.parse({ participantId });
    return this.client.request("conversations", conversationSchema, {
      method: "POST",
      body,
    });
  }

  async listMessages(conversationId: string, limit = 30, cursor?: string): Promise<MessageCursorPage> {
    const page = await this.client.request(
      `conversations/${pathId(conversationId)}/messages`,
      looseMessagePageSchema,
      {
        method: "GET",
        timeoutMs: 60_000,
        query: { limit, cursor },
      },
    );
    const items = page.items.flatMap((item) => {
      const parsed = messageSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    });
    if (page.items.length > 0 && items.length === 0) {
      throw new ApiError("invalid_response", "Saved messages came back in a form the app couldn't read.");
    }
    return { items, nextCursor: page.nextCursor ?? null, hasNext: page.hasNext === true };
  }

  async uploadAttachment(conversationId: string, bytes: Uint8Array): Promise<{ id: string; size: number }> {
    const path = `conversations/${pathId(conversationId)}/attachments`;
    try {
      return await this.client.request(path, attachmentCreatedSchema, {
        method: "POST",
        timeoutMs: 60_000,
        rawBody: bytes,
      });
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 415) throw error;
      return this.client.request(path, attachmentCreatedSchema, {
        method: "POST",
        timeoutMs: 60_000,
        multipart: { filename: "blob", contentType: "application/octet-stream", bytes },
      });
    }
  }

  downloadAttachment(attachmentId: string): Promise<Uint8Array> {
    return this.client.bytes(`attachments/${pathId(attachmentId)}`);
  }

  sendMessage(conversationId: string, input: SendMessageRequestDto): Promise<MessageDto> {
    const body = sendMessageRequestSchema.parse(input);
    return this.client.request(
      `conversations/${pathId(conversationId)}/messages`,
      messageSchema,
      {
        method: "POST",
        body,
      },
    );
  }

  markConversationRead(conversationId: string): Promise<unknown> {
    return this.client.request(`conversations/${pathId(conversationId)}/read`, undefined, { method: "POST" });
  }

  markRead(messageId: string): Promise<unknown> {
    return this.client.request(`messages/${pathId(messageId)}/read`, undefined, { method: "PATCH" });
  }

  setReaction(conversationId: string, messageId: string, emoji: string): Promise<ReactionSnapshotDto> {
    return this.client.request(
      `conversations/${pathId(conversationId)}/messages/${pathId(messageId)}/reaction`,
      reactionSnapshotSchema,
      { method: "PUT", body: { emoji } },
    );
  }

  clearReaction(conversationId: string, messageId: string): Promise<ReactionSnapshotDto> {
    return this.client.request(
      `conversations/${pathId(conversationId)}/messages/${pathId(messageId)}/reaction`,
      reactionSnapshotSchema,
      { method: "DELETE" },
    );
  }

  clearHistory(conversationId: string): Promise<{ conversationId: string; clearedAt: string }> {
    return this.client.request(
      `conversations/${pathId(conversationId)}/clear`,
      z.object({ conversationId: z.string().min(1), clearedAt: z.string().min(1) }).strict(),
      { method: "POST" },
    );
  }

  deleteMessage(messageId: string, scope: "me" | "everyone" = "me"): Promise<MessageDto> {
    return this.client.request(`messages/${pathId(messageId)}`, messageSchema, {
      method: "DELETE",
      query: { scope },
    });
  }
}
