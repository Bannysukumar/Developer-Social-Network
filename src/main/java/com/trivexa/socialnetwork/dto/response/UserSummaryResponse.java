package com.trivexa.socialnetwork.dto.response;

import com.trivexa.socialnetwork.domain.AccountType;
import com.trivexa.socialnetwork.domain.RelationshipView;

public record UserSummaryResponse(
        String id,
        String username,
        String displayName,
        String profileImageUrl,
        AccountType accountType,
        RelationshipView relationship
) {
}
