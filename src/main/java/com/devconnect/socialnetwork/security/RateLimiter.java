package com.devconnect.socialnetwork.security;

import java.time.Duration;

public interface RateLimiter {

    boolean tryAcquire(String key, int limit, Duration window);

    default boolean ping() {
        return true;
    }
}
