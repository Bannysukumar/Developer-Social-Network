package com.trivexa.socialnetwork.dto.request;

import com.trivexa.socialnetwork.domain.DevicePlatform;
import com.trivexa.socialnetwork.domain.KeyAlgorithm;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record RegisterIdentityKeyRequest(
        @Size(max = 32) String deviceId,
        @NotBlank @Size(max = 80) String deviceName,
        @NotNull DevicePlatform platform,
        @NotNull KeyAlgorithm algorithm,
        @NotBlank String publicKey
) {
}
