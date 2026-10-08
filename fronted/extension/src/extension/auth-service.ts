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
import { createDeviceMaterial, verifySignedPreKey, type DeviceMaterial } from "./crypto/device-keys";
import { decryptMessage, encryptForDevices, isEncryptedEnvelope, type RecipientBundle } from "./crypto/message-cipher";
import { decodeOpaqueText } from "../shared/payload";
import { SessionStore } from "./session";

export interface DisplayMessage extends MessageDto {
  readonly displayText: string;
}

export interface AuthServiceOptions {
  readonly fetcher?: typeof fetch;
}

export class AuthService {
  private readonly session: SessionStore;
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

  listConversations(): Promise<ConversationDto[]> {
    return this.conversationsApi.list().then((page) => [...page.items]);
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

  async ensureDeviceKeys(): Promise<void> {
    if (this.deviceKeys?.deviceId) return;
    const stored = await this.session.getDeviceKeys();
    if (stored) {
      const parsed = JSON.parse(stored) as DeviceMaterial;
      if (parsed.deviceId && parsed.identityPrivateJwk && parsed.signedPreKeyPrivateJwk) {
        this.deviceKeys = parsed;
        return;
      }
    }
    const material = createDeviceMaterial();
    const registered = await this.keysApi.registerIdentity({ publicKey: material.identityPublic });
    material.deviceId = registered.id;
    await this.keysApi.registerPreKeys({
      deviceId: registered.id,
      signedPreKey: {
        preKeyId: material.signedPreKeyId,
        publicKey: material.signedPreKeyPublic,
        signature: material.signedPreKeySignature,
      },
      oneTimePreKeys: material.oneTime.map((item) => ({ preKeyId: item.id, publicKey: item.publicKey })),
    });
    this.deviceKeys = material;
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
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }
    this.refreshInFlight = this.refreshAccessToken().finally(() => {
      this.refreshInFlight = undefined;
    });
    return this.refreshInFlight;
  }

  userFacingError(error: unknown): string {
    if (error instanceof ApiError) {
      return error.message;
    }
    if (error instanceof Error && error.message.includes("must use HTTPS")) {
      return error.message;
    }
    if (error instanceof Error && /DevConnect API|Invalid user id|encryption key|key signature|not registered/.test(error.message)) {
      return error.message;
    }
    return "Something went wrong. Try again.";
  }

  displayMessage(message: MessageDto): DisplayMessage {
    return {
      ...message,
      displayText: this.readMessage(message),
    };
  }

  private toDisplayMessage(message: MessageDto): DisplayMessage {
    return this.displayMessage(message);
  }

  private readMessage(message: MessageDto): string {
    if (message.deletedForEveryone) return "[deleted]";
    const decrypted = decryptMessage(message.ciphertext, this.deviceKeys);
    if (decrypted !== undefined) return decrypted;
    if (isEncryptedEnvelope(message.ciphertext)) return "Encrypted message";
    return decodeOpaqueText(message.ciphertext);
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
      if (device.algorithm !== "Ed25519" || !signed?.signature) continue;
      if (!verifySignedPreKey(device.identityPublicKey, signed.publicKey, signed.signature)) continue;
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
      throw new ApiError("configuration", "This friend has not published a verified encryption key.");
    }
    return recipients;
  }

  private async refreshAccessToken(): Promise<string | undefined> {
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
    });
  }
}
