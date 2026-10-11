package com.devconnect.socialnetwork.dto.response;

import java.time.Instant;

public record KeyBackupResponse(
        int version,
        String kdf,
        String salt,
        String iv,
        String ciphertext,
        Instant updatedAt
) {
}
