package com.trivexa.socialnetwork.dto.response;

import com.trivexa.socialnetwork.domain.NotificationType;

import java.time.Instant;

public record NotificationResponse(
        String id,
        NotificationType type,
        String actorId,
        String referenceId,
        String message,
        boolean read,
        Instant createdAt
) {
}
