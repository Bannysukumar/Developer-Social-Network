import { z } from "zod";
import {
  conversationSchema,
  deviceSchema,
  friendRequestSchema,
  messageSchema,
  notificationSchema,
  userProfileSchema,
  userSummarySchema,
} from "./api-types";
import { screenIds } from "./flow";

export const screenIdSchema = z.enum(screenIds);
export type ScreenId = z.infer<typeof screenIdSchema>;

export const webviewMessageSchema = z.discriminatedUnion("type", [
  z.object({ version: z.literal(1), type: z.literal("ready") }).strict(),
  z.object({ version: z.literal(1), type: z.literal("navigate"), destination: screenIdSchema }).strict(),
  z.object({ version: z.literal(1), type: z.literal("back") }).strict(),
  z.object({
    version: z.literal(1),
    type: z.literal("login"),
    usernameOrEmail: z.string().min(1).max(254),
    password: z.string().min(1).max(128),
  }).strict(),
  z.object({
    version: z.literal(1),
    type: z.literal("signup"),
    username: z.string().min(3).max(30),
    email: z.string().email().max(254),
    password: z.string().min(10).max(128),
    displayName: z.string().min(1).max(50),
  }).strict(),
  z.object({
    version: z.literal(1),
    type: z.literal("forgotPassword"),
    email: z.string().email().max(254),
  }).strict(),
  z.object({
    version: z.literal(1),
    type: z.literal("resetPassword"),
    token: z.string().min(1).max(512),
    newPassword: z.string().min(10).max(128),
  }).strict(),
  z.object({
    version: z.literal(1),
    type: z.literal("changePassword"),
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(10).max(128),
  }).strict(),
  z.object({ version: z.literal(1), type: z.literal("logout") }).strict(),
  z.object({ version: z.literal(1), type: z.literal("refreshProfile") }).strict(),
  z.object({ version: z.literal(1), type: z.literal("resendVerification") }).strict(),
  z.object({
    version: z.literal(1),
    type: z.literal("updateProfile"),
    displayName: z.string().min(1).max(50).optional(),
    bio: z.string().max(500).nullable().optional(),
    accountType: z.enum(["PUBLIC", "PRIVATE"]).optional(),
  }).strict(),
  z.object({
    version: z.literal(1),
    type: z.literal("searchUsers"),
    query: z.string().min(1).max(80),
  }).strict(),
  z.object({
    version: z.literal(1),
    type: z.literal("openUser"),
    userId: z.string().min(1),
  }).strict(),
  z.object({ version: z.literal(1), type: z.literal("loadSocial") }).strict(),
  z.object({
    version: z.literal(1),
    type: z.literal("sendFriendRequest"),
    userId: z.string().min(1),
  }).strict(),
  z.object({
    version: z.literal(1),
    type: z.literal("acceptFriendRequest"),
    requestId: z.string().min(1),
  }).strict(),
  z.object({
    version: z.literal(1),
    type: z.literal("rejectFriendRequest"),
    requestId: z.string().min(1),
  }).strict(),
  z.object({
    version: z.literal(1),
    type: z.literal("removeFriend"),
    userId: z.string().min(1),
  }).strict(),
  z.object({
    version: z.literal(1),
    type: z.literal("blockUser"),
    userId: z.string().min(1),
  }).strict(),
  z.object({
    version: z.literal(1),
    type: z.literal("unblockUser"),
    userId: z.string().min(1),
  }).strict(),
  z.object({ version: z.literal(1), type: z.literal("loadConversations") }).strict(),
  z.object({
    version: z.literal(1),
    type: z.literal("openConversation"),
    conversationId: z.string().min(1).optional(),
    participantId: z.string().min(1).optional(),
  }).strict(),
  z.object({
    version: z.literal(1),
    type: z.literal("sendMessage"),
    conversationId: z.string().min(1),
    text: z.string().min(1).max(4000),
  }).strict(),
  z.object({ version: z.literal(1), type: z.literal("loadNotifications") }).strict(),
  z.object({
    version: z.literal(1),
    type: z.literal("openNotification"),
    notificationId: z.string().min(1),
  }).strict(),
  z.object({
    version: z.literal(1),
    type: z.literal("markNotificationRead"),
    notificationId: z.string().min(1),
  }).strict(),
  z.object({ version: z.literal(1), type: z.literal("markAllNotificationsRead") }).strict(),
  z.object({ version: z.literal(1), type: z.literal("loadDevices") }).strict(),
  z.object({
    version: z.literal(1),
    type: z.literal("revokeDevice"),
    deviceId: z.string().min(1),
  }).strict(),
]);

export type WebviewMessage = z.infer<typeof webviewMessageSchema>;

const displayMessageSchema = messageSchema.extend({ displayText: z.string() });

export const hostMessageSchema = z.object({
  version: z.literal(1),
  type: z.literal("state"),
  phase: z.enum(["checking", "ready"]),
  screen: screenIdSchema,
  canGoBack: z.boolean(),
  authenticated: z.boolean(),
  insecureHttp: z.boolean(),
  e2eeEnabled: z.boolean(),
  user: userProfileSchema.nullable(),
  selectedUser: userProfileSchema.nullable(),
  error: z.string().nullable(),
  notice: z.string().nullable(),
  busy: z.boolean(),
  searchResults: z.array(userSummarySchema),
  friends: z.array(userSummarySchema),
  incomingRequests: z.array(friendRequestSchema),
  outgoingRequests: z.array(friendRequestSchema),
  conversations: z.array(conversationSchema),
  activeConversationId: z.string().nullable(),
  messages: z.array(displayMessageSchema),
  notifications: z.array(notificationSchema),
  unreadNotifications: z.number().int().nonnegative(),
  devices: z.array(deviceSchema),
}).strict();

export type HostMessage = z.infer<typeof hostMessageSchema>;
