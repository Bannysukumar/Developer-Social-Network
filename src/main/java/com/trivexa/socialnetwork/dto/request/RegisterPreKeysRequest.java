package com.trivexa.socialnetwork.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;

public record RegisterPreKeysRequest(
        @NotBlank String deviceId,
        @Valid PreKeyUploadRequest signedPreKey,
        @Valid @Size(max = 100) List<PreKeyUploadRequest> oneTimePreKeys
) {
}
