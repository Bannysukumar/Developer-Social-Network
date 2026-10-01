package com.devconnect.socialnetwork.dto.response;

import com.devconnect.socialnetwork.domain.MessageStatus;

import java.time.Instant;

public record MessageAck(
        String messageId,
        String conversationId,
        MessageStatus status,
        Instant deliveredAt,
        Instant readAt
) {
}
