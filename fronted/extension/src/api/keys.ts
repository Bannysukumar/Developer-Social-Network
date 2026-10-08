import type { ApiClient } from "./client";
import { pathId } from "./users";
import { deviceSchema, keyBundleSchema, type DeviceDto, type KeyBundleDto } from "../shared/api-types";

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
}
