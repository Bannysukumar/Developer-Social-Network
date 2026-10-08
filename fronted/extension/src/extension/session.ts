import type * as vscode from "vscode";
import type { UserProfileDto } from "../shared/api-types";

const ACCESS_TOKEN_KEY = "devconnect.accessToken";
const REFRESH_TOKEN_KEY = "devconnect.refreshToken";
const ACCESS_EXPIRES_KEY = "devconnect.accessTokenExpiresAt";
const USER_KEY = "devconnect.user";
const DEVICE_KEYS_KEY = "devconnect.deviceKeys";
const ROUTE_KEY = "devconnect.lastRoute";

export interface StoredSession {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly accessTokenExpiresAt: string;
  readonly user: UserProfileDto;
}

export class SessionStore {
  constructor(
    private readonly secrets: vscode.SecretStorage,
    private readonly globalState: vscode.Memento,
  ) {}

  async getAccessToken(): Promise<string | undefined> {
    return this.secrets.get(ACCESS_TOKEN_KEY);
  }

  async getRefreshToken(): Promise<string | undefined> {
    return this.secrets.get(REFRESH_TOKEN_KEY);
  }

  async getAccessTokenExpiresAt(): Promise<string | undefined> {
    return this.secrets.get(ACCESS_EXPIRES_KEY);
  }

  getUser(): UserProfileDto | undefined {
    const raw = this.globalState.get<string>(USER_KEY);
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as UserProfileDto;
    } catch {
      return undefined;
    }
  }

  async save(session: StoredSession): Promise<void> {
    await Promise.all([
      this.secrets.store(ACCESS_TOKEN_KEY, session.accessToken),
      this.secrets.store(REFRESH_TOKEN_KEY, session.refreshToken),
      this.secrets.store(ACCESS_EXPIRES_KEY, session.accessTokenExpiresAt),
      this.globalState.update(USER_KEY, JSON.stringify(session.user)),
    ]);
  }

  async getDeviceKeys(): Promise<string | undefined> {
    return this.secrets.get(DEVICE_KEYS_KEY);
  }

  async saveDeviceKeys(serialized: string): Promise<void> {
    await this.secrets.store(DEVICE_KEYS_KEY, serialized);
  }

  async updateUser(user: UserProfileDto): Promise<void> {
    await this.globalState.update(USER_KEY, JSON.stringify(user));
  }

  rememberRoute(screen: string, conversationId: string | null): void {
    void this.globalState.update(ROUTE_KEY, JSON.stringify({ screen, conversationId }));
  }

  lastRoute(): { screen: string; conversationId: string | null } | undefined {
    const raw = this.globalState.get<string>(ROUTE_KEY);
    if (!raw) return undefined;
    try {
      const parsed = JSON.parse(raw) as { screen?: unknown; conversationId?: unknown };
      if (typeof parsed.screen !== "string") return undefined;
      return { screen: parsed.screen, conversationId: typeof parsed.conversationId === "string" ? parsed.conversationId : null };
    } catch {
      return undefined;
    }
  }

  async clear(): Promise<void> {
    await Promise.all([
      this.secrets.delete(ACCESS_TOKEN_KEY),
      this.secrets.delete(REFRESH_TOKEN_KEY),
      this.secrets.delete(ACCESS_EXPIRES_KEY),
      this.globalState.update(USER_KEY, undefined),
      this.globalState.update(ROUTE_KEY, undefined),
    ]);
  }

  isAuthenticated(): boolean {
    return this.getUser() !== undefined;
  }
}
