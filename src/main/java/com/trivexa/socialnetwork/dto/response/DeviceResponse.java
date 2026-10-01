package com.trivexa.socialnetwork.dto.response;

import com.trivexa.socialnetwork.domain.DevicePlatform;
import com.trivexa.socialnetwork.domain.KeyAlgorithm;

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
