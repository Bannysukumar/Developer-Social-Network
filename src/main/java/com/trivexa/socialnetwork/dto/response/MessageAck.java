package com.trivexa.socialnetwork.dto.response;

import com.trivexa.socialnetwork.domain.MessageStatus;

import java.time.Instant;

public record MessageAck(
        String messageId,
        String conversationId,
        MessageStatus status,
        Instant deliveredAt,
        Instant readAt
) {
}
