package com.trivexa.socialnetwork.dto.response;

import com.trivexa.socialnetwork.domain.FriendRequestStatus;

import java.time.Instant;

public record FriendRequestResponse(
        String id,
        String senderId,
        String recipientId,
        UserSummaryResponse counterpart,
        FriendRequestStatus status,
        Instant createdAt,
        Instant updatedAt
) {
}
