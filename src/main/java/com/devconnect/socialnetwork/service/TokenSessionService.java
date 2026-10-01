package com.devconnect.socialnetwork.service;

import com.devconnect.socialnetwork.config.AppProperties;
import com.devconnect.socialnetwork.crypto.TokenHasher;
import com.devconnect.socialnetwork.entity.RefreshTokenEntity;
import com.devconnect.socialnetwork.entity.RevokedAccessTokenEntity;
import com.devconnect.socialnetwork.entity.RevokedTokenFamilyEntity;
import com.devconnect.socialnetwork.entity.UserEntity;
import com.devconnect.socialnetwork.exception.ExpiredTokenException;
import com.devconnect.socialnetwork.exception.InvalidTokenException;
import com.devconnect.socialnetwork.repository.RefreshTokenRepository;
import com.devconnect.socialnetwork.repository.RevokedAccessTokenRepository;
import com.devconnect.socialnetwork.repository.RevokedTokenFamilyRepository;
import com.devconnect.socialnetwork.repository.UserRepository;
import com.devconnect.socialnetwork.security.JwtService;
import com.devconnect.socialnetwork.util.Ids;
import org.springframework.data.mongodb.core.FindAndModifyOptions;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;

@Service
public class TokenSessionService {

    private final RefreshTokenRepository refreshTokenRepository;
    private final RevokedAccessTokenRepository revokedAccessTokenRepository;
    private final RevokedTokenFamilyRepository revokedTokenFamilyRepository;
    private final UserRepository userRepository;
    private final JwtService jwtService;
    private final AppProperties properties;
    private final MongoTemplate mongoTemplate;
    private final Clock clock;

    public TokenSessionService(
            RefreshTokenRepository refreshTokenRepository,
            RevokedAccessTokenRepository revokedAccessTokenRepository,
            RevokedTokenFamilyRepository revokedTokenFamilyRepository,
            UserRepository userRepository,
            JwtService jwtService,
            AppProperties properties,
            MongoTemplate mongoTemplate,
            Clock clock
    ) {
        this.refreshTokenRepository = refreshTokenRepository;
        this.revokedAccessTokenRepository = revokedAccessTokenRepository;
        this.revokedTokenFamilyRepository = revokedTokenFamilyRepository;
        this.userRepository = userRepository;
        this.jwtService = jwtService;
        this.properties = properties;
        this.mongoTemplate = mongoTemplate;
        this.clock = clock;
    }

    public IssuedRefresh issue(String userId, String deviceId) {
        return issue(userId, deviceId, Ids.newId());
    }

    public Rotation rotate(String rawRefreshToken) {
        RefreshTokenEntity current = consume(rawRefreshToken);
        IssuedRefresh next = issue(current.getUserId(), current.getDeviceId(), current.getFamilyId());
        mongoTemplate.updateFirst(
                Query.query(Criteria.where("_id").is(current.getId())),
                new Update().set("replacedByTokenId", next.tokenId()),
                RefreshTokenEntity.class
        );
        UserEntity user = userRepository.findById(current.getUserId())
                .orElseThrow(() -> new InvalidTokenException("Refresh token is invalid"));
        return new Rotation(user, next);
    }

    public void revokePresented(String userId, String rawRefreshToken, String accessToken) {
        RefreshTokenEntity token = refreshTokenRepository.findByTokenHash(TokenHasher.sha256(rawRefreshToken)).orElse(null);
        if (token == null || !token.getUserId().equals(userId)) {
            throw new InvalidTokenException("Refresh token is invalid");
        }
        if (!token.isRevoked()) {
            token.setRevoked(true);
            token.setRevokedAt(clock.instant());
            refreshTokenRepository.save(token);
        }
        if (accessToken != null) {
            var claims = jwtService.parseAccessToken(accessToken);
            if (claims.userId().equals(userId)) {
                revokedAccessTokenRepository.save(new RevokedAccessTokenEntity(claims.jti(), claims.expiresAt()));
            }
        }
    }

    public void revokeAll(String userId) {
        Instant now = clock.instant();
        userRepository.findById(userId).ifPresent(user -> {
            user.setSessionValidAfter(now);
            user.setUpdatedAt(now);
            userRepository.save(user);
        });
        for (RefreshTokenEntity token : refreshTokenRepository.findByUserIdAndRevokedFalse(userId)) {
            token.setRevoked(true);
            token.setRevokedAt(now);
            refreshTokenRepository.save(token);
        }
    }

    public void revokeDevice(String deviceId) {
        Instant now = clock.instant();
        for (RefreshTokenEntity token : refreshTokenRepository.findByDeviceIdAndRevokedFalse(deviceId)) {
            token.setRevoked(true);
            token.setRevokedAt(now);
            refreshTokenRepository.save(token);
            revokeFamily(token);
        }
    }

    private IssuedRefresh issue(String userId, String deviceId, String familyId) {
        String raw = "rt_" + TokenHasher.randomToken();
        RefreshTokenEntity entity = new RefreshTokenEntity();
        entity.setId(Ids.newId());
        entity.setUserId(userId);
        entity.setDeviceId(deviceId);
        entity.setFamilyId(familyId);
        entity.setTokenHash(TokenHasher.sha256(raw));
        entity.setCreatedAt(clock.instant());
        entity.setExpiresAt(clock.instant().plus(properties.getJwt().getRefreshTokenTtl()));
        refreshTokenRepository.save(entity);
        return new IssuedRefresh(entity.getId(), raw, entity.getExpiresAt(), familyId);
    }

    private RefreshTokenEntity consume(String rawRefreshToken) {
        if (rawRefreshToken == null || !rawRefreshToken.startsWith("rt_")) {
            throw new InvalidTokenException("Refresh token is invalid");
        }
        String hash = TokenHasher.sha256(rawRefreshToken);
        Instant now = clock.instant();
        Query query = Query.query(Criteria.where("tokenHash").is(hash)
                .and("revoked").is(false)
                .and("expiresAt").gt(now));
        Update update = new Update().set("revoked", true).set("revokedAt", now);
        RefreshTokenEntity consumed = mongoTemplate.findAndModify(
                query, update, FindAndModifyOptions.options().returnNew(false), RefreshTokenEntity.class);
        if (consumed != null) {
            return consumed;
        }
        RefreshTokenEntity existing = refreshTokenRepository.findByTokenHash(hash).orElse(null);
        if (existing != null && existing.isRevoked()) {
            revokeFamily(existing);
            throw new InvalidTokenException("Refresh token is no longer valid");
        }
        if (existing != null && existing.getExpiresAt().isBefore(now)) {
            throw new ExpiredTokenException("Refresh token has expired");
        }
        throw new InvalidTokenException("Refresh token is invalid");
    }

    private void revokeFamily(RefreshTokenEntity token) {
        Instant expiresAt = clock.instant().plus(properties.getJwt().getRefreshTokenTtl());
        revokedTokenFamilyRepository.save(new RevokedTokenFamilyEntity(token.getFamilyId(), token.getUserId(), expiresAt));
        Instant now = clock.instant();
        for (RefreshTokenEntity member : refreshTokenRepository.findByFamilyId(token.getFamilyId())) {
            if (!member.isRevoked()) {
                member.setRevoked(true);
                member.setRevokedAt(now);
                refreshTokenRepository.save(member);
            }
        }
    }

    public record IssuedRefresh(String tokenId, String rawToken, Instant expiresAt, String familyId) {
    }

    public record Rotation(UserEntity user, IssuedRefresh refresh) {
    }
}
