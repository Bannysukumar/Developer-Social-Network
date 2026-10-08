import { z } from "zod";

/** The documented success envelope shared by DevConnect API operations. */
export interface ApiResponse<T> {
  readonly success: boolean;
  readonly message: string;
  readonly data: T;
}

export const accountTypeSchema = z.enum(["PUBLIC", "PRIVATE"]);
export const accountStatusSchema = z.enum(["ACTIVE", "SUSPENDED", "DELETED"]);
export const relationshipSchema = z.enum([
  "SELF",
  "NONE",
  "OUTGOING_REQUEST",
  "INCOMING_REQUEST",
  "FRIENDS",
  "BLOCKED",
]);

export const userProfileSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  displayName: z.string().min(1),
  bio: z.string().nullable().optional(),
  profileImageUrl: z.string().nullable().optional(),
  accountType: accountTypeSchema,
  status: accountStatusSchema.optional(),
  emailVerified: z.boolean().optional(),
  email: z.string().optional(),
  relationship: relationshipSchema.optional(),
  createdAt: z.string().optional(),
  limited: z.boolean().optional(),
}).passthrough();

export type UserProfileDto = z.infer<typeof userProfileSchema>;

export const userSummarySchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  displayName: z.string().min(1),
  profileImageUrl: z.string().nullable().optional(),
  accountType: accountTypeSchema,
  relationship: relationshipSchema.optional(),
}).passthrough();

export type UserSummaryDto = z.infer<typeof userSummarySchema>;

export function pageSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    page: z.number().int().nonnegative(),
    size: z.number().int().positive(),
    totalElements: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
    hasNext: z.boolean(),
  }).passthrough();
}

export function cursorPageSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    nextCursor: z.string().nullable(),
    hasNext: z.boolean(),
  }).passthrough();
}

export const authResponseSchema = z.object({
  tokenType: z.string().min(1),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  accessTokenExpiresAt: z.string().min(1),
  refreshTokenExpiresAt: z.string().min(1),
  user: userProfileSchema,
}).strict();

export type AuthResponseDto = z.infer<typeof authResponseSchema>;

export const loginRequestSchema = z.object({
  usernameOrEmail: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(128),
}).strict();

export type LoginRequestDto = z.infer<typeof loginRequestSchema>;

export const signupRequestSchema = z.object({
  username: z.string().trim().min(3).max(30),
  email: z.string().trim().email().max(254),
  password: z.string().min(10).max(128),
  displayName: z.string().trim().min(1).max(50),
}).strict();

export type SignupRequestDto = z.infer<typeof signupRequestSchema>;

export const updateProfileRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(50).optional(),
  bio: z.string().max(500).nullable().optional(),
  accountType: accountTypeSchema.optional(),
}).strict();

export type UpdateProfileRequestDto = z.infer<typeof updateProfileRequestSchema>;

export const friendRequestSchema = z.object({
  id: z.string().min(1),
  senderId: z.string().min(1),
  recipientId: z.string().min(1),
  counterpart: userSummarySchema,
  status: z.enum(["PENDING", "ACCEPTED", "REJECTED", "CANCELLED"]),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
}).passthrough();

export type FriendRequestDto = z.infer<typeof friendRequestSchema>;

export const conversationSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["ONE_TO_ONE"]),
  participantIds: z.array(z.string().min(1)),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
}).passthrough();

export type ConversationDto = z.infer<typeof conversationSchema>;

export const messageSchema = z.object({
  id: z.string().min(1),
  conversationId: z.string().min(1),
  senderId: z.string().min(1),
  recipientId: z.string().min(1),
  ciphertext: z.string(),
  messageType: z.enum(["TEXT", "IMAGE", "FILE", "SYSTEM"]),
  status: z.enum(["SENT", "DELIVERED", "READ"]),
  deviceId: z.string().nullable().optional(),
  keyId: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  deliveredAt: z.string().nullable().optional(),
  readAt: z.string().nullable().optional(),
  deletedForEveryone: z.boolean().optional(),
}).passthrough();

export type MessageDto = z.infer<typeof messageSchema>;

export const createConversationRequestSchema = z.object({
  participantId: z.string().min(1),
}).strict();

export const sendMessageRequestSchema = z.object({
  ciphertext: z.string().min(1),
  messageType: z.enum(["TEXT", "IMAGE", "FILE"]).optional(),
  clientMessageId: z.string().optional(),
  deviceId: z.string().optional(),
  keyId: z.string().optional(),
}).strict();

export type SendMessageRequestDto = z.infer<typeof sendMessageRequestSchema>;

export const notificationSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["FRIEND_REQUEST", "FRIEND_REQUEST_ACCEPTED", "NEW_MESSAGE", "SECURITY", "ACCOUNT"]),
  actorId: z.string().nullable().optional(),
  referenceId: z.string().nullable().optional(),
  message: z.string().min(1),
  read: z.boolean(),
  createdAt: z.string().optional(),
}).passthrough();

export type NotificationDto = z.infer<typeof notificationSchema>;

export const notificationListSchema = z.object({
  page: pageSchema(notificationSchema),
  unreadCount: z.number().int().nonnegative(),
}).passthrough();

export type NotificationListDto = z.infer<typeof notificationListSchema>;

export const blockStatusSchema = z.object({
  blocked: z.boolean(),
  blockedByMe: z.boolean().optional(),
  blockedMe: z.boolean().optional(),
}).passthrough();

export type BlockStatusDto = z.infer<typeof blockStatusSchema>;

export const deviceSchema = z.object({
  id: z.string().min(1),
  deviceName: z.string().nullable().optional(),
  platform: z.string().nullable().optional(),
  algorithm: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  lastSeenAt: z.string().nullable().optional(),
  revoked: z.boolean().optional(),
}).passthrough();

export type DeviceDto = z.infer<typeof deviceSchema>;

const preKeyMaterialSchema = z.object({
  preKeyId: z.number().int(),
  publicKey: z.string().min(1),
  signature: z.string().nullable().optional(),
}).passthrough();

export const keyBundleSchema = z.object({
  userId: z.string().min(1),
  devices: z.array(z.object({
    deviceId: z.string().min(1),
    algorithm: z.enum(["Ed25519", "X25519"]),
    identityPublicKey: z.string().min(1),
    signedPreKey: preKeyMaterialSchema.nullable().optional(),
    oneTimePreKey: preKeyMaterialSchema.nullable().optional(),
    unusedOneTimePreKeyCount: z.number().int().nullable().optional(),
  }).passthrough()),
}).passthrough();

export type KeyBundleDto = z.infer<typeof keyBundleSchema>;

export const forgotPasswordRequestSchema = z.object({
  email: z.string().trim().email().max(254),
}).strict();

export const resetPasswordRequestSchema = z.object({
  token: z.string().trim().min(1).max(512),
  newPassword: z.string().min(10).max(128),
}).strict();

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(10).max(128),
}).strict();
