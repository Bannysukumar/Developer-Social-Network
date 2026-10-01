package com.trivexa.socialnetwork.dto.response;

import java.time.Instant;

public record AuthResponse(
        String tokenType,
        String accessToken,
        String refreshToken,
        Instant accessTokenExpiresAt,
        Instant refreshTokenExpiresAt,
        UserProfileResponse user
) {
}
