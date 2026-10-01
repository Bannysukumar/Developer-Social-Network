package com.trivexa.socialnetwork.dto.request;

import com.trivexa.socialnetwork.domain.MessageType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record SendMessageRequest(
        @NotBlank @Size(max = 65536) String ciphertext,
        MessageType messageType,
        @Size(max = 64) @Pattern(regexp = "^[A-Za-z0-9_-]{8,64}$") String clientMessageId,
        @Size(max = 64) String deviceId,
        @Size(max = 128) String keyId
) {
}
