package com.devconnect.socialnetwork.dto.request;

import com.devconnect.socialnetwork.domain.MessageType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;

public record SendMessageRequest(
        @NotBlank @Size(max = 65536) String ciphertext,
        MessageType messageType,
        @Size(max = 64) @Pattern(regexp = "^[A-Za-z0-9_-]{8,64}$") String clientMessageId,
        @Size(max = 64) String deviceId,
        @Size(max = 128) String keyId,
        @Size(max = 10) List<@NotBlank @Size(max = 32) String> attachmentIds
) {
}
