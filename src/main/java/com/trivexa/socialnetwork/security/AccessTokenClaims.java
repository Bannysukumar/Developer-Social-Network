package com.trivexa.socialnetwork.security;

import com.trivexa.socialnetwork.domain.Role;

import java.time.Instant;
import java.util.Set;

public record AccessTokenClaims(
        String userId,
        String username,
        Set<Role> roles,
        String jti,
        String familyId,
        Instant issuedAt,
        Instant expiresAt
) {
}
