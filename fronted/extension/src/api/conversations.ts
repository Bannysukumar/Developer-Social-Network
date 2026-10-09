import type { ApiClient } from "./client";
import { pathId } from "./users";
import {
  conversationSchema,
  createConversationRequestSchema,
  cursorPageSchema,
  messageSchema,
  pageSchema,
  sendMessageRequestSchema,
  type ConversationDto,
  type MessageDto,
  type SendMessageRequestDto,
} from "../shared/api-types";

const conversationPageSchema = pageSchema(conversationSchema);
const messageCursorSchema = cursorPageSchema(messageSchema);

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

  listMessages(conversationId: string, limit = 30, cursor?: string): Promise<MessageCursorPage> {
    return this.client.request(
      `conversations/${pathId(conversationId)}/messages`,
      messageCursorSchema,
      {
        method: "GET",
        query: { limit, cursor },
      },
    );
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

  deleteMessage(messageId: string, scope: "me" | "everyone" = "me"): Promise<MessageDto> {
    return this.client.request(`messages/${pathId(messageId)}`, messageSchema, {
      method: "DELETE",
      query: { scope },
    });
  }
}
