package com.devconnect.socialnetwork.dto.response;

import java.time.Instant;

public record ClearNotificationsResponse(long cleared, Instant clearedAt) {
}
