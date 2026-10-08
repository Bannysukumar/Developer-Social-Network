import type * as vscode from "vscode";
import type { UserProfileDto } from "../shared/api-types";

const ACCESS_TOKEN_KEY = "devconnect.accessToken";
const REFRESH_TOKEN_KEY = "devconnect.refreshToken";
const ACCESS_EXPIRES_KEY = "devconnect.accessTokenExpiresAt";
const USER_KEY = "devconnect.user";
const DEVICE_KEYS_KEY = "devconnect.deviceKeys";

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

  async clear(): Promise<void> {
    await Promise.all([
      this.secrets.delete(ACCESS_TOKEN_KEY),
      this.secrets.delete(REFRESH_TOKEN_KEY),
      this.secrets.delete(ACCESS_EXPIRES_KEY),
      this.globalState.update(USER_KEY, undefined),
    ]);
  }

  isAuthenticated(): boolean {
    return this.getUser() !== undefined;
  }
}
