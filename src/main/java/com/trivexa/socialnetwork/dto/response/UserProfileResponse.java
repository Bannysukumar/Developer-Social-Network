package com.trivexa.socialnetwork.dto.response;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.trivexa.socialnetwork.domain.AccountStatus;
import com.trivexa.socialnetwork.domain.AccountType;
import com.trivexa.socialnetwork.domain.RelationshipView;
import com.trivexa.socialnetwork.domain.Role;

import java.time.Instant;
import java.util.Set;

public record UserProfileResponse(
        String id,
        String username,
        String displayName,
        String bio,
        String profileImageUrl,
        AccountType accountType,
        @JsonInclude(JsonInclude.Include.NON_NULL) AccountStatus status,
        @JsonInclude(JsonInclude.Include.NON_NULL) Boolean emailVerified,
        @JsonInclude(JsonInclude.Include.NON_NULL) String email,
        @JsonInclude(JsonInclude.Include.NON_NULL) Set<Role> roles,
        RelationshipView relationship,
        @JsonInclude(JsonInclude.Include.NON_NULL) Instant createdAt,
        boolean limited
) {
}
