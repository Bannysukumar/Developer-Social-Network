package com.devconnect.socialnetwork.dto.response;

import com.devconnect.socialnetwork.domain.ConversationType;

import java.time.Instant;
import java.util.List;

public record ConversationResponse(
        String id,
        ConversationType type,
        List<String> participantIds,
        Instant createdAt,
        Instant updatedAt
) {
}
