import { z } from "zod";
import type { ApiClient } from "./client";
import { ApiError } from "./errors";
import { pathId } from "./users";
import { deviceSchema, keyBundleSchema, type DeviceDto, type KeyBundleDto } from "../shared/api-types";

export interface KeyBackupDto {
  readonly version: 1;
  readonly kdf: "scrypt";
  readonly salt: string;
  readonly iv: string;
  readonly ciphertext: string;
}

export interface IdentityRegistration {
  readonly publicKey: string;
}

export interface PreKeyRegistration {
  readonly deviceId: string;
  readonly signedPreKey: { readonly preKeyId: number; readonly publicKey: string; readonly signature: string };
  readonly oneTimePreKeys: readonly { readonly preKeyId: number; readonly publicKey: string }[];
}

export class KeysApi {
  constructor(private readonly client: ApiClient) {}

  registerIdentity(input: IdentityRegistration): Promise<DeviceDto> {
    return this.client.request("keys/identity", deviceSchema, {
      method: "POST",
      body: {
        deviceName: "VS Code",
        platform: "EXTENSION",
        algorithm: "Ed25519",
        publicKey: input.publicKey,
      },
    });
  }

  registerPreKeys(input: PreKeyRegistration): Promise<unknown> {
    return this.client.request("keys/prekeys", undefined, {
      method: "POST",
      body: input,
    });
  }

  bundle(userId: string): Promise<KeyBundleDto> {
    return this.client.request(`keys/${pathId(userId)}`, keyBundleSchema, { method: "GET" });
  }

  async getBackup(): Promise<KeyBackupDto | null> {
    try {
      const data = await this.client.request("keys/backup", keyBackupSchema.nullable(), { method: "GET" });
      if (!data) return null;
      return data;
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  }

  putBackup(blob: KeyBackupDto): Promise<KeyBackupDto> {
    return this.client.request("keys/backup", keyBackupSchema, { method: "PUT", body: blob });
  }
}

const keyBackupSchema = z.object({
  version: z.literal(1),
  kdf: z.literal("scrypt"),
  salt: z.string().min(1),
  iv: z.string().min(1),
  ciphertext: z.string().min(1),
  updatedAt: z.string().optional(),
});
