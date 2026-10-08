package com.devconnect.socialnetwork.dto.response;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.devconnect.socialnetwork.domain.AccountType;
import com.devconnect.socialnetwork.domain.RelationshipView;

public record UserSummaryResponse(
        String id,
        String username,
        String displayName,
        String profileImageUrl,
        AccountType accountType,
        RelationshipView relationship,
        @JsonInclude(JsonInclude.Include.NON_NULL) PresenceView presence
) {
}
