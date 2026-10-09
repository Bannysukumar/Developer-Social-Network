import type * as vscode from "vscode";
import { AuthApi } from "../api/auth";
import { ApiClient } from "../api/client";
import type { ApiConfig } from "../api/config";
import { ConversationsApi } from "../api/conversations";
import { DevicesApi } from "../api/devices";
import { ApiError } from "../api/errors";
import { FriendsApi } from "../api/friends";
import { KeysApi } from "../api/keys";
import { NotificationsApi } from "../api/notifications";
import { UsersApi } from "../api/users";
import type {
  AuthResponseDto,
  ConversationDto,
  FriendRequestDto,
  LoginRequestDto,
  MessageDto,
  NotificationDto,
  SignupRequestDto,
  UpdateProfileRequestDto,
  DeviceDto,
  UserProfileDto,
  UserSummaryDto,
} from "../shared/api-types";
import { createDeviceMaterial, hasVerifiedSignedPreKey, type DeviceMaterial } from "./crypto/device-keys";
import { decryptMessage, encryptForDevices, isEncryptedEnvelope, type RecipientBundle } from "./crypto/message-cipher";
import { openFile, sealFile } from "./crypto/file-cipher";
import { encodeFilePayload, parseFilePayload, type SharedFile } from "./crypto/file-payload";
import { decodeOpaqueText } from "../shared/payload";
import { SessionStore } from "./session";

export interface DisplayMessage extends MessageDto {
  readonly displayText: string;
  readonly sendState?: "failed" | "sending";
  readonly attachments?: readonly SharedFile[];
}

export interface AuthServiceOptions {
  readonly fetcher?: typeof fetch;
}

export class AuthService {
  private readonly session: SessionStore;
  private readonly peerNames = new Map<string, { displayName: string; username: string; profileImageUrl?: string | null }>();
  private client: ApiClient;
  private authApi: AuthApi;
  private usersApi: UsersApi;
  private friendsApi: FriendsApi;
  private conversationsApi: ConversationsApi;
  private notificationsApi: NotificationsApi;
  private devicesApi: DevicesApi;
  private keysApi: KeysApi;
  private deviceKeys: DeviceMaterial | undefined;
  private config: ApiConfig;
  private readonly fetcher?: typeof fetch;
  private refreshInFlight: Promise<string | undefined> | undefined;

  constructor(context: vscode.ExtensionContext, config: ApiConfig, options?: AuthServiceOptions) {
    this.session = new SessionStore(context.secrets, context.globalState);
    this.fetcher = options?.fetcher;
    this.config = config;
    this.client = this.createClient();
    this.authApi = new AuthApi(this.client);
    this.usersApi = new UsersApi(this.client);
    this.friendsApi = new FriendsApi(this.client);
    this.conversationsApi = new ConversationsApi(this.client);
    this.notificationsApi = new NotificationsApi(this.client);
    this.devicesApi = new DevicesApi(this.client);
    this.keysApi = new KeysApi(this.client);
  }

  get apiConfig(): ApiConfig {
    return this.config;
  }

  getUser(): UserProfileDto | undefined {
    return this.session.getUser();
  }

  isAuthenticated(): boolean {
    return this.session.isAuthenticated();
  }

  getAccessToken(): Promise<string | undefined> {
    return this.session.getAccessToken();
  }

  /** Returns a token that is still valid, refreshing it when it is close to expiry. */
  async ensureFreshAccessToken(): Promise<string | undefined> {
    const [token, expiresAt] = await Promise.all([
      this.session.getAccessToken(),
      this.session.getAccessTokenExpiresAt(),
    ]);
    if (!token) return undefined;
    const expiresMs = expiresAt ? Date.parse(expiresAt) : Number.NaN;
    if (!Number.isNaN(expiresMs) && expiresMs - Date.now() < 60_000) {
      return this.refreshAccessToken();
    }
    return token;
  }

  reloadConfig(config: ApiConfig): void {
    this.config = config;
    this.rebuildApis();
  }

  async login(input: LoginRequestDto): Promise<UserProfileDto> {
    const response = await this.authApi.login(input);
    await this.persist(response);
    return response.user;
  }

  async signup(input: SignupRequestDto): Promise<UserProfileDto> {
    const response = await this.authApi.signup(input);
    await this.persist(response);
    return response.user;
  }

  async forgotPassword(email: string): Promise<void> {
    await this.authApi.forgotPassword(email);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    await this.authApi.resetPassword(token, newPassword);
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await this.authApi.changePassword(currentPassword, newPassword);
    await this.session.clear();
    this.peerNames.clear();
  }

  async resendVerification(): Promise<void> {
    await this.authApi.resendVerification();
  }

  getUserById(userId: string): Promise<UserProfileDto> {
    return this.usersApi.get(userId);
  }

  unblockUser(userId: string): Promise<unknown> {
    return this.usersApi.unblock(userId);
  }

  listDevices(): Promise<DeviceDto[]> {
    return this.devicesApi.list(false);
  }

  revokeDevice(deviceId: string): Promise<unknown> {
    return this.devicesApi.revoke(deviceId);
  }

  async logout(): Promise<void> {
    const refreshToken = await this.session.getRefreshToken();
    try {
      if (refreshToken) {
        await this.authApi.logout(refreshToken);
      }
    } catch {
      // Clear local session even if logout fails.
    }
    await this.session.clear();
    this.peerNames.clear();
    this.keysPublished = false;
  }

  async refreshProfile(): Promise<UserProfileDto> {
    const user = await this.usersApi.me();
    await this.session.updateUser(user);
    return user;
  }

  async updateProfile(input: UpdateProfileRequestDto): Promise<UserProfileDto> {
    const user = await this.usersApi.updateMe(input);
    await this.session.updateUser(user);
    return user;
  }

  async uploadAvatar(bytes: Uint8Array, contentType: "image/jpeg" | "image/png" | "image/webp"): Promise<UserProfileDto> {
    const user = await this.usersApi.uploadAvatar(bytes, contentType);
    await this.session.updateUser(user);
    return user;
  }

  async removeAvatar(): Promise<UserProfileDto> {
    return this.updateProfile({ clearProfileImage: true });
  }

  blockedUsers(): Promise<UserSummaryDto[]> {
    return this.usersApi.blocked().then((items) => [...items]);
  }

  async avatarDataUrl(fileId: string): Promise<string | undefined> {
    const token = await this.ensureFreshAccessToken();
    if (!token) return undefined;
    const response = await fetch(`${this.config.baseUrl}/media/${encodeURIComponent(fileId)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "image/*" },
      cache: "no-store",
    });
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error("Profile picture could not be loaded.");
    const type = response.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) return undefined;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > 2_097_152) return undefined;
    return `data:${type};base64,${bytes.toString("base64")}`;
  }

  searchUsers(query: string): Promise<UserSummaryDto[]> {
    return this.usersApi.search(query).then((page) => [...page.items]);
  }

  async loadSocial(): Promise<{
    friends: UserSummaryDto[];
    incoming: FriendRequestDto[];
    outgoing: FriendRequestDto[];
  }> {
    const [friends, incoming, outgoing] = await Promise.all([
      this.friendsApi.list(),
      this.friendsApi.incoming(),
      this.friendsApi.outgoing(),
    ]);
    return {
      friends: [...friends.items],
      incoming: [...incoming.items],
      outgoing: [...outgoing.items],
    };
  }

  sendFriendRequest(userId: string): Promise<FriendRequestDto> {
    return this.friendsApi.sendRequest(userId);
  }

  acceptFriendRequest(requestId: string): Promise<FriendRequestDto> {
    return this.friendsApi.accept(requestId);
  }

  rejectFriendRequest(requestId: string): Promise<FriendRequestDto> {
    return this.friendsApi.reject(requestId);
  }

  removeFriend(userId: string): Promise<unknown> {
    return this.friendsApi.remove(userId);
  }

  blockUser(userId: string): Promise<unknown> {
    return this.usersApi.block(userId);
  }

  blockStatus(userId: string): Promise<{ blockedByMe: boolean; blockedMe: boolean }> {
    return this.usersApi.blockStatus(userId);
  }

  async listConversations(): Promise<ConversationDto[]> {
    const page = await this.conversationsApi.list();
    const selfId = this.getUser()?.id;
    return Promise.all(page.items.map((conversation) => this.withPeerName(conversation, selfId)));
  }

  private async withPeerName(conversation: ConversationDto, selfId: string | undefined): Promise<ConversationDto> {
    const otherId = conversation.participantIds.find((id) => id !== selfId);
    if (!otherId) return conversation;
    const cached = this.peerNames.get(otherId);
    if (cached && "profileImageUrl" in cached) {
      return {
        ...conversation,
        peerDisplayName: cached.displayName,
        peerUsername: cached.username,
        peerProfileImageUrl: cached.profileImageUrl,
      };
    }
    try {
      const profile = await this.usersApi.get(otherId);
      const peer = { displayName: profile.displayName, username: profile.username, profileImageUrl: profile.profileImageUrl };
      this.peerNames.set(otherId, peer);
      return {
        ...conversation,
        peerDisplayName: peer.displayName,
        peerUsername: peer.username,
        peerProfileImageUrl: peer.profileImageUrl,
      };
    } catch {
      return conversation;
    }
  }

  async openConversation(options: {
    conversationId?: string;
    participantId?: string;
  }): Promise<{ conversation: ConversationDto; messages: DisplayMessage[] }> {
    let conversation: ConversationDto;
    if (options.conversationId) {
      conversation = await this.conversationsApi.get(options.conversationId);
    } else if (options.participantId) {
      conversation = await this.conversationsApi.create(options.participantId);
    } else {
      throw new ApiError("request", "Choose a friend or conversation first.");
    }
    const page = await this.conversationsApi.listMessages(conversation.id);
    return {
      conversation,
      messages: page.items.map((message) => this.toDisplayMessage(message)),
    };
  }

  hasDeviceKeys(): boolean {
    return this.deviceKeys?.deviceId !== undefined;
  }

  private keysPublished = false;

  async ensureDeviceKeys(): Promise<void> {
    const material = await this.loadDeviceMaterial();
    const userId = this.getUser()?.id;
    if (this.keysPublished && material.deviceId) {
      this.deviceKeys = material;
      return;
    }
    const published = material.deviceId && userId
      ? await this.publishedKeyIsUsable(userId, material.deviceId)
      : false;
    if (published === true) {
      this.deviceKeys = material;
      this.keysPublished = true;
      return;
    }
    if (published === "unknown" && material.deviceId) {
      this.deviceKeys = material;
      return;
    }
    if (!material.deviceId) {
      const registered = await this.keysApi.registerIdentity({ publicKey: material.identityPublic });
      material.deviceId = registered.id;
      await this.uploadPreKeys(material, true);
    } else {
      try {
        await this.uploadPreKeys(material, false);
      } catch {
        const registered = await this.keysApi.registerIdentity({ publicKey: material.identityPublic });
        material.deviceId = registered.id;
        await this.uploadPreKeys(material, true);
      }
    }
    this.deviceKeys = material;
    this.keysPublished = true;
    await this.session.saveDeviceKeys(JSON.stringify(material));
  }

  async sendMessage(conversationId: string, text: string): Promise<DisplayMessage> {
    await this.ensureDeviceKeys();
    const keys = this.deviceKeys;
    if (!keys?.deviceId) {
      throw new ApiError("configuration", "This device is not registered.");
    }
    const conversation = await this.conversationsApi.get(conversationId);
    const selfId = this.getUser()?.id;
    const recipientId = conversation.participantIds.find((id) => id !== selfId);
    if (!recipientId) {
      throw new ApiError("request", "Choose a friend or conversation first.");
    }
    const bundle = await this.keysApi.bundle(recipientId);
    const recipients = this.pickRecipients(bundle.devices);
    const message = await this.conversationsApi.sendMessage(conversationId, {
      ciphertext: encryptForDevices(text, conversationId, keys, recipients),
      messageType: "TEXT",
      clientMessageId: `ext-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      deviceId: keys.deviceId,
      keyId: String(recipients[0]?.oneTimePreKey?.preKeyId ?? recipients[0]?.signedPreKey.preKeyId ?? ""),
    });
    return this.displayMessage(message);
  }

  async sendFiles(
    conversationId: string,
    text: string,
    files: readonly { name: string; mime: string; bytes: Buffer }[],
    clientMessageId: string,
  ): Promise<DisplayMessage> {
    if (files.length < 1 || files.length > 10) {
      throw new ApiError("request", "Too many files");
    }
    await this.ensureDeviceKeys();
    const keys = this.deviceKeys;
    if (!keys?.deviceId) {
      throw new ApiError("configuration", "This device is not registered.");
    }
    const uploaded: SharedFile[] = [];
    for (const file of files) {
      if (file.bytes.length < 1 || file.bytes.length > 10_485_760) {
        throw new ApiError("request", "File size is not allowed");
      }
      const sealed = sealFile(file.bytes);
      const stored = await this.conversationsApi.uploadAttachment(conversationId, sealed.ciphertext);
      const mime = file.mime || "application/octet-stream";
      uploaded.push({
        id: stored.id,
        name: file.name.replace(/[\\/]/g, "_").slice(0, 180),
        size: file.bytes.length,
        mime,
        key: sealed.key,
        iv: sealed.iv,
        preview: mime.startsWith("image/") && file.bytes.length <= 8_000_000
          ? `data:${mime};base64,${file.bytes.toString("base64")}`
          : undefined,
      });
    }
    const conversation = await this.conversationsApi.get(conversationId);
    const selfId = this.getUser()?.id;
    const recipientId = conversation.participantIds.find((id) => id !== selfId);
    if (!recipientId) {
      throw new ApiError("request", "Choose a friend or conversation first.");
    }
    const bundle = await this.keysApi.bundle(recipientId);
    const recipients = this.pickRecipients(bundle.devices);
    const message = await this.conversationsApi.sendMessage(conversationId, {
      ciphertext: encryptForDevices(encodeFilePayload(text, uploaded), conversationId, keys, recipients),
      messageType: uploaded.every((file) => file.mime.startsWith("image/")) ? "IMAGE" : "FILE",
      clientMessageId,
      deviceId: keys.deviceId,
      keyId: String(recipients[0]?.oneTimePreKey?.preKeyId ?? recipients[0]?.signedPreKey.preKeyId ?? ""),
      attachmentIds: uploaded.map((file) => file.id),
    });
    const shown = this.displayMessage(message);
    return {
      ...shown,
      attachments: shown.attachments?.map((item) => {
        const source = uploaded.find((file) => file.id === item.id);
        return source?.preview ? { ...item, preview: source.preview } : item;
      }),
    };
  }

  async downloadAttachment(attachmentId: string, key: string, iv: string): Promise<Uint8Array> {
    const ciphertext = await this.conversationsApi.downloadAttachment(attachmentId);
    return openFile(Buffer.from(ciphertext), key, iv);
  }

  markConversationRead(conversationId: string): Promise<unknown> {
    return this.conversationsApi.markConversationRead(conversationId);
  }

  deleteMessage(messageId: string, scope: "me" | "everyone"): Promise<DisplayMessage> {
    return this.conversationsApi.deleteMessage(messageId, scope).then((message) => this.displayMessage(message));
  }

  async loadNotifications(): Promise<{ items: NotificationDto[]; unreadCount: number }> {
    const list = await this.notificationsApi.list();
    return { items: [...list.page.items], unreadCount: list.unreadCount };
  }

  markNotificationRead(notificationId: string): Promise<NotificationDto> {
    return this.notificationsApi.markRead(notificationId);
  }

  markAllNotificationsRead(): Promise<unknown> {
    return this.notificationsApi.markAllRead();
  }

  async tryRefreshAccessToken(): Promise<string | undefined> {
    return this.refreshAccessToken();
  }

  renewAccessToken(): Promise<string | undefined> {
    return this.refreshAccessToken();
  }

  rememberRoute(screen: string, conversationId: string | null): void {
    this.session.rememberRoute(screen, conversationId);
  }

  lastRoute(): { screen: string; conversationId: string | null } | undefined {
    return this.session.lastRoute();
  }

  async invalidateSession(): Promise<void> {
    await this.session.clear();
    this.peerNames.clear();
  }

  userFacingError(error: unknown): string {
    if (error instanceof ApiError) {
      return error.message;
    }
    if (error instanceof Error && error.message.includes("must use HTTPS")) {
      return error.message;
    }
    if (error instanceof Error && /DevConnect API|Invalid user id|encryption key|key signature|not registered|Profile picture|You can't interact|File size|Too many files|file could not be opened/.test(error.message)) {
      return error.message;
    }
    return "Something went wrong. Try again.";
  }

  displayMessage(message: MessageDto & Partial<Pick<DisplayMessage, "displayText" | "sendState">>): DisplayMessage {
    if (message.id.startsWith("local-")) {
      return {
        ...message,
        displayText: message.displayText ?? "",
        sendState: message.sendState,
      };
    }
    const described = this.describeMessage(message);
    return {
      ...message,
      displayText: described.displayText,
      attachments: described.attachments,
    };
  }

  private toDisplayMessage(message: MessageDto): DisplayMessage {
    return this.displayMessage(message);
  }

  private describeMessage(message: MessageDto): { displayText: string; attachments?: readonly SharedFile[] } {
    if (message.deletedForEveryone) return { displayText: "This message was deleted" };
    const ciphertext = message.ciphertext ?? "";
    const decrypted = decryptMessage(ciphertext, this.deviceKeys);
    if (decrypted !== undefined) {
      const payload = parseFilePayload(decrypted);
      if (payload) {
        const caption = payload.text.trim();
        return {
          displayText: caption || payload.files.map((file) => file.name).join(", "),
          attachments: payload.files,
        };
      }
      return { displayText: decrypted };
    }
    if (isEncryptedEnvelope(ciphertext)) return { displayText: "Encrypted message" };
    return { displayText: decodeOpaqueText(ciphertext) };
  }

  private pickRecipients(devices: readonly {
    deviceId: string;
    algorithm: "Ed25519" | "X25519";
    identityPublicKey: string;
    signedPreKey?: { preKeyId: number; publicKey: string; signature?: string | null } | null;
    oneTimePreKey?: { preKeyId: number; publicKey: string; signature?: string | null } | null;
  }[]): RecipientBundle[] {
    const recipients: RecipientBundle[] = [];
    for (const device of devices) {
      const signed = device.signedPreKey;
      if (!hasVerifiedSignedPreKey(device) || !signed?.signature) continue;
      recipients.push({
        deviceId: device.deviceId,
        identityPublicKey: device.identityPublicKey,
        signedPreKey: { preKeyId: signed.preKeyId, publicKey: signed.publicKey, signature: signed.signature },
        oneTimePreKey: device.oneTimePreKey
          ? { preKeyId: device.oneTimePreKey.preKeyId, publicKey: device.oneTimePreKey.publicKey }
          : null,
      });
    }
    if (recipients.length === 0) {
      const published = devices.some((device) => device.signedPreKey?.publicKey);
      throw new ApiError(
        "configuration",
        published
          ? "This friend's encryption key could not be verified. Ask them to open DevConnect again, then send again."
          : "This friend has not published an encryption key yet. Ask them to open DevConnect and sign in, then send again.",
      );
    }
    return recipients;
  }

  private async loadDeviceMaterial(): Promise<DeviceMaterial> {
    if (this.deviceKeys?.identityPrivateJwk && this.deviceKeys.signedPreKeyPrivateJwk) {
      return this.deviceKeys;
    }
    const stored = await this.session.getDeviceKeys();
    if (stored) {
      const parsed = JSON.parse(stored) as DeviceMaterial;
      if (parsed.identityPrivateJwk && parsed.signedPreKeyPrivateJwk) return parsed;
    }
    return createDeviceMaterial();
  }

  private async publishedKeyIsUsable(userId: string, deviceId: string): Promise<true | false | "unknown"> {
    try {
      const bundle = await this.keysApi.bundle(userId);
      return bundle.devices.some((device) => device.deviceId === deviceId && hasVerifiedSignedPreKey(device));
    } catch {
      return "unknown";
    }
  }

  private uploadPreKeys(material: DeviceMaterial, includeOneTime: boolean): Promise<unknown> {
    if (!material.deviceId) {
      throw new ApiError("configuration", "This device is not registered.");
    }
    return this.keysApi.registerPreKeys({
      deviceId: material.deviceId,
      signedPreKey: {
        preKeyId: material.signedPreKeyId,
        publicKey: material.signedPreKeyPublic,
        signature: material.signedPreKeySignature,
      },
      oneTimePreKeys: includeOneTime
        ? material.oneTime.map((item) => ({ preKeyId: item.id, publicKey: item.publicKey }))
        : [],
    });
  }

  private refreshAccessToken(): Promise<string | undefined> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.performRefresh().finally(() => {
        this.refreshInFlight = undefined;
      });
    }
    return this.refreshInFlight;
  }

  private async performRefresh(): Promise<string | undefined> {
    const refreshToken = await this.session.getRefreshToken();
    if (!refreshToken) {
      await this.session.clear();
      return undefined;
    }
    try {
      const response = await this.authApi.refresh(refreshToken);
      await this.persist(response);
      return response.accessToken;
    } catch {
      await this.session.clear();
      return undefined;
    }
  }

  private async persist(response: AuthResponseDto): Promise<void> {
    await this.session.save({
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      accessTokenExpiresAt: response.accessTokenExpiresAt,
      user: response.user,
    });
  }

  private rebuildApis(): void {
    this.client = this.createClient();
    this.authApi = new AuthApi(this.client);
    this.usersApi = new UsersApi(this.client);
    this.friendsApi = new FriendsApi(this.client);
    this.conversationsApi = new ConversationsApi(this.client);
    this.notificationsApi = new NotificationsApi(this.client);
    this.devicesApi = new DevicesApi(this.client);
    this.keysApi = new KeysApi(this.client);
  }

  private createClient(): ApiClient {
    return new ApiClient(this.config, {
      fetcher: this.fetcher,
      getAccessToken: () => this.session.getAccessToken(),
      onUnauthorized: () => this.tryRefreshAccessToken(),
      onSessionRejected: () => this.invalidateSession(),
    });
  }
}
