package com.trivexa.socialnetwork.dto.response;

import com.trivexa.socialnetwork.domain.MessageStatus;
import com.trivexa.socialnetwork.domain.MessageType;

import java.time.Instant;

public record MessageResponse(
        String id,
        String conversationId,
        String senderId,
        String recipientId,
        String ciphertext,
        MessageType messageType,
        MessageStatus status,
        String deviceId,
        String keyId,
        Instant createdAt,
        Instant deliveredAt,
        Instant readAt,
        boolean deletedForEveryone
) {
}
