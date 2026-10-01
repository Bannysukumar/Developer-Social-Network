package com.trivexa.socialnetwork.dto.request;

import jakarta.validation.constraints.NotBlank;

public record CreateConversationRequest(@NotBlank String participantId) {
}
