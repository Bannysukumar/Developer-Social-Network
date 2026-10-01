package com.devconnect.socialnetwork.dto.request;

import com.devconnect.socialnetwork.domain.DevicePlatform;
import jakarta.validation.constraints.Size;

public record DeviceContextRequest(
        @Size(max = 32) String deviceId,
        @Size(max = 80) String deviceName,
        DevicePlatform platform
) {
}
