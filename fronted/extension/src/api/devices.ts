import { z } from "zod";
import type { ApiClient } from "./client";
import { pathId } from "./users";
import { deviceSchema, type DeviceDto } from "../shared/api-types";

export class DevicesApi {
  constructor(private readonly client: ApiClient) {}

  list(includeRevoked = false): Promise<DeviceDto[]> {
    return this.client.request("devices", z.array(deviceSchema), {
      method: "GET",
      query: { includeRevoked },
    });
  }

  revoke(deviceId: string): Promise<unknown> {
    return this.client.request(`devices/${pathId(deviceId)}`, undefined, { method: "DELETE" });
  }
}
