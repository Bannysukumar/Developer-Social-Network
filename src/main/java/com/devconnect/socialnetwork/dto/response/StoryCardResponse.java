package com.devconnect.socialnetwork.dto.response;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record StoryCardResponse(
        String id,
        String ownerId,
        String mediaType,
        String contentType,
        String caption,
        String textStyle,
        String createdAt,
        String expiresAt,
        boolean viewed,
        boolean mine,
        Long viewCount,
        String myReaction
) {
}
