package com.devconnect.socialnetwork.dto.response;

import com.devconnect.socialnetwork.domain.DevicePlatform;
import com.devconnect.socialnetwork.domain.KeyAlgorithm;

import java.time.Instant;

public record DeviceResponse(
        String id,
        String deviceName,
        DevicePlatform platform,
        KeyAlgorithm algorithm,
        String publicKey,
        Instant createdAt,
        Instant lastSeenAt,
        boolean revoked
) {
}
