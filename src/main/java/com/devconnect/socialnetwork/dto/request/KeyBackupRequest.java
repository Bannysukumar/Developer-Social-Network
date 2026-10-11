package com.devconnect.socialnetwork.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record KeyBackupRequest(
        @NotNull @Min(1) @Max(1) Integer version,
        @NotBlank @Size(max = 32) String kdf,
        @NotBlank @Size(max = 256) String salt,
        @NotBlank @Size(max = 256) String iv,
        @NotBlank @Size(max = 200000) String ciphertext
) {
}
