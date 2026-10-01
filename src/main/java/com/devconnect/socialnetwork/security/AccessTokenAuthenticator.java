package com.devconnect.socialnetwork.security;

import com.devconnect.socialnetwork.domain.AccountStatus;
import com.devconnect.socialnetwork.entity.UserEntity;
import com.devconnect.socialnetwork.exception.InvalidTokenException;
import com.devconnect.socialnetwork.repository.RevokedAccessTokenRepository;
import com.devconnect.socialnetwork.repository.RevokedTokenFamilyRepository;
import com.devconnect.socialnetwork.repository.UserRepository;
import org.springframework.stereotype.Component;

@Component
public class AccessTokenAuthenticator {

    private final JwtService jwtService;
    private final UserRepository userRepository;
    private final RevokedAccessTokenRepository revokedAccessTokenRepository;
    private final RevokedTokenFamilyRepository revokedTokenFamilyRepository;

    public AccessTokenAuthenticator(
            JwtService jwtService,
            UserRepository userRepository,
            RevokedAccessTokenRepository revokedAccessTokenRepository,
            RevokedTokenFamilyRepository revokedTokenFamilyRepository
    ) {
        this.jwtService = jwtService;
        this.userRepository = userRepository;
        this.revokedAccessTokenRepository = revokedAccessTokenRepository;
        this.revokedTokenFamilyRepository = revokedTokenFamilyRepository;
    }

    public AuthenticatedUser authenticate(String token) {
        AccessTokenClaims claims = jwtService.parseAccessToken(token);
        if (revokedAccessTokenRepository.existsByJti(claims.jti())
                || revokedTokenFamilyRepository.existsById(claims.familyId())) {
            throw new InvalidTokenException("Access token is no longer valid");
        }
        UserEntity user = userRepository.findById(claims.userId())
                .orElseThrow(() -> new InvalidTokenException("Access token is invalid"));
        if (user.getStatus() != AccountStatus.ACTIVE) {
            throw new InvalidTokenException("Access token is invalid");
        }
        if (user.getSessionValidAfter() != null && claims.issuedAt().isBefore(user.getSessionValidAfter())) {
            throw new InvalidTokenException("Access token is no longer valid");
        }
        return new AuthenticatedUser(user.getId(), user.getUsername(), user.getRoles());
    }

    public AccessTokenClaims claims(String token) {
        return jwtService.parseAccessToken(token);
    }
}
