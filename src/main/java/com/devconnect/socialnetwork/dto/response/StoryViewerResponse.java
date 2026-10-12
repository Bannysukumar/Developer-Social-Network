package com.devconnect.socialnetwork.dto.response;

public record StoryViewerResponse(
        String id,
        String username,
        String displayName,
        String viewedAt
) {
}
