package com.devconnect.socialnetwork.dto.response;

import java.util.List;

public record StoryRingResponse(
        UserSummaryResponse user,
        boolean unseen,
        List<StoryCardResponse> stories
) {
}
