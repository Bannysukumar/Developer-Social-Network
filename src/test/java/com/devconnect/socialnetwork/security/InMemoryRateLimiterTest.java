package com.devconnect.socialnetwork.security;

import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

class InMemoryRateLimiterTest {

    @Test
    void blocksAfterTheLimit() {
        InMemoryRateLimiter limiter = new InMemoryRateLimiter();
        assertThat(limiter.tryAcquire("login:1", 2, Duration.ofMinutes(1))).isTrue();
        assertThat(limiter.tryAcquire("login:1", 2, Duration.ofMinutes(1))).isTrue();
        assertThat(limiter.tryAcquire("login:1", 2, Duration.ofMinutes(1))).isFalse();
    }
}
