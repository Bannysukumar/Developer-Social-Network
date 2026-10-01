package com.trivexa.socialnetwork.security;

import com.trivexa.socialnetwork.config.AppProperties;
import com.trivexa.socialnetwork.domain.Role;
import com.trivexa.socialnetwork.entity.UserEntity;
import com.trivexa.socialnetwork.exception.ExpiredTokenException;
import com.trivexa.socialnetwork.exception.InvalidTokenException;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.Date;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
public class JwtService {

    private final AppProperties properties;
    private final Clock clock;
    private final SecretKey key;

    public JwtService(AppProperties properties, Clock clock) {
        this.properties = properties;
        this.clock = clock;
        byte[] secret = properties.getJwt().getSecret() == null
                ? new byte[0]
                : properties.getJwt().getSecret().getBytes(StandardCharsets.UTF_8);
        if (secret.length < 32) {
            throw new IllegalStateException("JWT secret must be at least 32 bytes");
        }
        this.key = Keys.hmacShaKeyFor(secret);
    }

    public String createAccessToken(UserEntity user, String familyId) {
        Instant now = clock.instant();
        Instant expires = now.plus(properties.getJwt().getAccessTokenTtl());
        return Jwts.builder()
                .issuer(properties.getJwt().getIssuer())
                .audience().add(properties.getJwt().getAudience()).and()
                .subject(user.getId())
                .id(UUID.randomUUID().toString())
                .claim("username", user.getUsername())
                .claim("roles", user.getRoles().stream().map(Enum::name).toList())
                .claim("typ", "access")
                .claim("fid", familyId)
                .issuedAt(Date.from(now))
                .expiration(Date.from(expires))
                .signWith(key)
                .compact();
    }

    public AccessTokenClaims parseAccessToken(String token) {
        try {
            Claims claims = Jwts.parser()
                    .verifyWith(key)
                    .requireIssuer(properties.getJwt().getIssuer())
                    .clock(() -> Date.from(clock.instant()))
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
            Set<String> audience = claims.getAudience();
            if (audience == null || !audience.contains(properties.getJwt().getAudience())) {
                throw new InvalidTokenException("Access token is invalid");
            }
            if (claims.getIssuedAt() == null || claims.getExpiration() == null) {
                throw new InvalidTokenException("Access token is invalid");
            }
            if (!"access".equals(claims.get("typ", String.class))) {
                throw new InvalidTokenException("Access token is invalid");
            }
            String familyId = claims.get("fid", String.class);
            if (familyId == null || familyId.isBlank() || claims.getSubject() == null || claims.getId() == null) {
                throw new InvalidTokenException("Access token is invalid");
            }
            return new AccessTokenClaims(
                    claims.getSubject(),
                    claims.get("username", String.class),
                    parseRoles(claims.get("roles")),
                    claims.getId(),
                    familyId,
                    claims.getIssuedAt().toInstant(),
                    claims.getExpiration().toInstant()
            );
        } catch (ExpiredJwtException ex) {
            throw new ExpiredTokenException("Access token has expired");
        } catch (InvalidTokenException | ExpiredTokenException ex) {
            throw ex;
        } catch (JwtException | IllegalArgumentException ex) {
            throw new InvalidTokenException("Access token is invalid");
        }
    }

    public Instant accessExpiryFromNow() {
        return clock.instant().plus(properties.getJwt().getAccessTokenTtl());
    }

    public Instant refreshExpiryFromNow() {
        return clock.instant().plus(properties.getJwt().getRefreshTokenTtl());
    }

    @SuppressWarnings("unchecked")
    private Set<Role> parseRoles(Object raw) {
        Set<Role> roles = new LinkedHashSet<>();
        if (!(raw instanceof List<?> values)) {
            throw new InvalidTokenException("Access token is invalid");
        }
        for (Object value : values) {
            if (!(value instanceof String name)) {
                throw new InvalidTokenException("Access token is invalid");
            }
            try {
                roles.add(Role.valueOf(name));
            } catch (IllegalArgumentException ex) {
                throw new InvalidTokenException("Access token is invalid");
            }
        }
        if (roles.isEmpty()) {
            throw new InvalidTokenException("Access token is invalid");
        }
        return roles;
    }
}
