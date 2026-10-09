package com.devconnect.socialnetwork.dto.response;

import com.devconnect.socialnetwork.domain.MessageStatus;
import com.devconnect.socialnetwork.domain.MessageType;

import java.time.Instant;
import java.util.List;

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
        boolean deletedForEveryone,
        List<String> attachmentIds
) {
}
