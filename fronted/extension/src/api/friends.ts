import type { ApiClient } from "./client";
import { pathId } from "./users";
import {
  friendRequestSchema,
  pageSchema,
  userSummarySchema,
  type FriendRequestDto,
  type UserSummaryDto,
} from "../shared/api-types";

const friendPageSchema = pageSchema(userSummarySchema);
const friendRequestPageSchema = pageSchema(friendRequestSchema);

export type FriendPage = {
  readonly items: readonly UserSummaryDto[];
  readonly page: number;
  readonly size: number;
  readonly totalElements: number;
  readonly totalPages: number;
  readonly hasNext: boolean;
};

export type FriendRequestPage = {
  readonly items: readonly FriendRequestDto[];
  readonly page: number;
  readonly size: number;
  readonly totalElements: number;
  readonly totalPages: number;
  readonly hasNext: boolean;
};

export class FriendsApi {
  constructor(private readonly client: ApiClient) {}

  list(page = 0, size = 20): Promise<FriendPage> {
    return this.client.request("friends", friendPageSchema, {
      method: "GET",
      query: { page, size },
    });
  }

  remove(userId: string): Promise<unknown> {
    return this.client.request(`friends/${pathId(userId)}`, undefined, { method: "DELETE" });
  }

  sendRequest(userId: string): Promise<FriendRequestDto> {
    return this.client.request(`friend-requests/${pathId(userId)}`, friendRequestSchema, { method: "POST" });
  }

  incoming(page = 0, size = 20): Promise<FriendRequestPage> {
    return this.client.request("friend-requests/incoming", friendRequestPageSchema, {
      method: "GET",
      query: { page, size },
    });
  }

  outgoing(page = 0, size = 20): Promise<FriendRequestPage> {
    return this.client.request("friend-requests/outgoing", friendRequestPageSchema, {
      method: "GET",
      query: { page, size },
    });
  }

  accept(requestId: string): Promise<FriendRequestDto> {
    return this.client.request(`friend-requests/${pathId(requestId)}/accept`, friendRequestSchema, {
      method: "POST",
    });
  }

  reject(requestId: string): Promise<FriendRequestDto> {
    return this.client.request(`friend-requests/${pathId(requestId)}/reject`, friendRequestSchema, {
      method: "POST",
    });
  }

  cancel(requestId: string): Promise<unknown> {
    return this.client.request(`friend-requests/${pathId(requestId)}`, undefined, { method: "DELETE" });
  }
}
