import { z } from "zod";
import type { ApiClient } from "./client";
import { ApiError } from "./errors";
import {
  blockStatusSchema,
  pageSchema,
  updateProfileRequestSchema,
  userProfileSchema,
  userSummarySchema,
  type BlockStatusDto,
  type UpdateProfileRequestDto,
  type UserProfileDto,
  type UserSummaryDto,
} from "../shared/api-types";

const userPageSchema = pageSchema(userSummarySchema);

export type UserSearchPage = {
  readonly items: readonly UserSummaryDto[];
  readonly page: number;
  readonly size: number;
  readonly totalElements: number;
  readonly totalPages: number;
  readonly hasNext: boolean;
};

export class UsersApi {
  constructor(private readonly client: ApiClient) {}

  me(): Promise<UserProfileDto> {
    return this.client.request("users/me", userProfileSchema, { method: "GET" });
  }

  get(userId: string): Promise<UserProfileDto> {
    return this.client.request(`users/${pathId(userId)}`, userProfileSchema, { method: "GET" });
  }

  search(q: string, page = 0, size = 20): Promise<UserSearchPage> {
    return this.client.request("users/search", userPageSchema, {
      method: "GET",
      query: { q, page, size },
    });
  }

  updateMe(input: UpdateProfileRequestDto): Promise<UserProfileDto> {
    const body = updateProfileRequestSchema.parse(input);
    return this.client.request("users/me", userProfileSchema, { method: "PATCH", body });
  }

  uploadAvatar(bytes: Uint8Array, contentType: "image/jpeg" | "image/png" | "image/webp"): Promise<UserProfileDto> {
    const extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
    return this.client.request("users/me/avatar", userProfileSchema, {
      method: "POST",
      multipart: { filename: `avatar.${extension}`, contentType, bytes },
    });
  }

  blocked(): Promise<readonly UserSummaryDto[]> {
    return this.client.request("users/me/blocks", z.array(userSummarySchema), { method: "GET" });
  }

  block(userId: string): Promise<unknown> {
    return this.client.request(`users/${pathId(userId)}/block`, undefined, { method: "POST" });
  }

  unblock(userId: string): Promise<unknown> {
    return this.client.request(`users/${pathId(userId)}/block`, undefined, { method: "DELETE" });
  }

  blockStatus(userId: string): Promise<BlockStatusDto> {
    return this.client.request(`users/${pathId(userId)}/block-status`, blockStatusSchema, { method: "GET" });
  }
}

export function pathId(value: string): string {
  if (!value || value.includes("/") || value.includes("\\") || value.includes("..")) {
    throw new ApiError("request", "The API path is invalid.");
  }
  return encodeURIComponent(value);
}
