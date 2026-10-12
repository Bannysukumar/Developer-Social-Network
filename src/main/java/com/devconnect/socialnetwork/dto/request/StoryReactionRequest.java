package com.devconnect.socialnetwork.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record StoryReactionRequest(
        @NotBlank @Size(max = 8) String emoji
) {
}
