import { z } from "zod";
import type { ApiClient } from "./client";
import { pathId } from "./users";

export const storyCardSchema = z.object({
  id: z.string().min(1),
  ownerId: z.string().min(1),
  mediaType: z.enum(["IMAGE", "VIDEO"]),
  contentType: z.string().min(1),
  caption: z.string(),
  textStyle: z.enum(["plain", "light", "dark"]),
  createdAt: z.string(),
  expiresAt: z.string(),
  viewed: z.boolean(),
  mine: z.boolean(),
  viewCount: z.number().int().nonnegative().nullable().optional(),
  myReaction: z.string().nullable().optional(),
}).passthrough();

export type StoryCard = z.infer<typeof storyCardSchema>;

const storyUserSchema = z.object({
  id: z.string().min(1),
  username: z.string(),
  displayName: z.string(),
}).passthrough();

export const storyRingSchema = z.object({
  user: storyUserSchema,
  unseen: z.boolean(),
  stories: z.array(storyCardSchema),
}).passthrough();

export type StoryRing = z.infer<typeof storyRingSchema>;

export const storyTraySchema = z.object({
  mine: z.array(storyCardSchema),
  rings: z.array(storyRingSchema),
}).passthrough();

export type StoryTray = z.infer<typeof storyTraySchema>;

const viewerSchema = z.object({
  id: z.string().min(1),
  username: z.string(),
  displayName: z.string(),
  viewedAt: z.string(),
}).passthrough();

export type StoryViewer = z.infer<typeof viewerSchema>;

export class StoriesApi {
  constructor(private readonly client: ApiClient) {}

  tray(): Promise<StoryTray> {
    return this.client.request("stories", storyTraySchema, { method: "GET" });
  }

  publish(input: { clientStoryId: string; caption: string; textStyle: string; bytes: Uint8Array; contentType: string }): Promise<StoryCard> {
    return this.client.request("stories", storyCardSchema, {
      method: "POST",
      timeoutMs: 60_000,
      multipart: {
        filename: "story",
        contentType: input.contentType,
        bytes: input.bytes,
        fields: {
          clientStoryId: input.clientStoryId,
          caption: input.caption,
          textStyle: input.textStyle,
        },
      },
    });
  }

  view(storyId: string): Promise<StoryCard> {
    return this.client.request(`stories/${pathId(storyId)}/views`, storyCardSchema, { method: "POST" });
  }

  viewers(storyId: string): Promise<StoryViewer[]> {
    return this.client.request(`stories/${pathId(storyId)}/viewers`, z.array(viewerSchema), { method: "GET" });
  }

  react(storyId: string, emoji: string): Promise<StoryCard> {
    return this.client.request(`stories/${pathId(storyId)}/reactions`, storyCardSchema, {
      method: "POST",
      body: { emoji },
    });
  }

  clearReaction(storyId: string): Promise<StoryCard> {
    return this.client.request(`stories/${pathId(storyId)}/reactions`, storyCardSchema, { method: "DELETE" });
  }

  remove(storyId: string): Promise<unknown> {
    return this.client.request(`stories/${pathId(storyId)}`, undefined, { method: "DELETE" });
  }

  media(storyId: string): Promise<Uint8Array> {
    return this.client.request(`stories/${pathId(storyId)}/media`, undefined, {
      method: "GET",
      binary: true,
      timeoutMs: 60_000,
    }) as Promise<Uint8Array>;
  }
}
