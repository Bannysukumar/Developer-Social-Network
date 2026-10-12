package com.devconnect.socialnetwork.dto.response;

import java.util.List;

public record StoryTrayResponse(
        List<StoryCardResponse> mine,
        List<StoryRingResponse> rings
) {
}
