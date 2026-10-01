package com.devconnect.socialnetwork.security;

import com.devconnect.socialnetwork.config.AppProperties;
import com.devconnect.socialnetwork.domain.AccountStatus;
import com.devconnect.socialnetwork.domain.AccountType;
import com.devconnect.socialnetwork.domain.Role;
import com.devconnect.socialnetwork.entity.UserEntity;
import com.devconnect.socialnetwork.exception.ExpiredTokenException;
import com.devconnect.socialnetwork.exception.InvalidTokenException;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JwtServiceTest {

    @Test
    void rejectsExpiredAndTamperedTokens() {
        MutableClock clock = new MutableClock(Instant.parse("2026-01-01T00:00:00Z"));
        JwtService service = new JwtService(properties(Duration.ofSeconds(5)), clock);
        UserEntity user = user();
        String token = service.createAccessToken(user, "family-1");
        assertThat(service.parseAccessToken(token).userId()).isEqualTo(user.getId());

        clock.plus(Duration.ofSeconds(10));
        assertThatThrownBy(() -> service.parseAccessToken(token)).isInstanceOf(ExpiredTokenException.class);
        assertThatThrownBy(() -> service.parseAccessToken(token + "x")).isInstanceOf(InvalidTokenException.class);
    }

    @Test
    void rejectsAShortSecret() {
        assertThatThrownBy(() -> new JwtService(properties(Duration.ofMinutes(1), "short"), Clock.systemUTC()))
                .isInstanceOf(IllegalStateException.class);
    }

    private static AppProperties properties(Duration ttl) {
        return properties(ttl, "test-only-secret-key-must-be-32-bytes-min");
    }

    private static AppProperties properties(Duration ttl, String secret) {
        AppProperties properties = new AppProperties();
        properties.getJwt().setSecret(secret);
        properties.getJwt().setAccessTokenTtl(ttl);
        properties.getJwt().setRefreshTokenTtl(Duration.ofDays(7));
        return properties;
    }

    private static UserEntity user() {
        UserEntity user = new UserEntity();
        user.setId("507f1f77bcf86cd799439011");
        user.setUsername("ada");
        user.setAccountType(AccountType.PUBLIC);
        user.setStatus(AccountStatus.ACTIVE);
        user.setRoles(Set.of(Role.USER));
        return user;
    }

    private static final class MutableClock extends Clock {
        private Instant instant;

        private MutableClock(Instant instant) {
            this.instant = instant;
        }

        private void plus(Duration duration) {
            instant = instant.plus(duration);
        }

        @Override
        public ZoneOffset getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return instant;
        }
    }
}
