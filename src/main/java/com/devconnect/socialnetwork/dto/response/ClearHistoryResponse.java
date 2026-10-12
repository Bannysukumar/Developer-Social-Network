package com.devconnect.socialnetwork.dto.response;

import java.time.Instant;

public record ClearHistoryResponse(String conversationId, Instant clearedAt) {
}
