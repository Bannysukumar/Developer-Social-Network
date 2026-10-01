package com.trivexa.socialnetwork.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record PreKeyUploadRequest(
        @NotNull @Min(1) @Max(1_000_000_000) Integer preKeyId,
        @NotBlank String publicKey,
        String signature
) {
}
