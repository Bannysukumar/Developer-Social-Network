package com.devconnect.socialnetwork.config;

import com.devconnect.socialnetwork.security.RateLimiter;
import com.devconnect.socialnetwork.security.RedisRateLimiter;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.stereotype.Component;

@Component("rateLimitStore")
public class RateLimitStoreHealthIndicator implements HealthIndicator {

    private final AppProperties properties;
    private final RateLimiter rateLimiter;

    public RateLimitStoreHealthIndicator(AppProperties properties, RateLimiter rateLimiter) {
        this.properties = properties;
        this.rateLimiter = rateLimiter;
    }

    @Override
    public Health health() {
        if (!(rateLimiter instanceof RedisRateLimiter)) {
            return Health.up().withDetail("store", properties.getRateLimit().getStore()).build();
        }
        try {
            if (rateLimiter.ping()) {
                return Health.up().withDetail("store", "redis").build();
            }
            return Health.down().withDetail("store", "redis").build();
        } catch (RuntimeException ex) {
            return Health.down().withDetail("store", "redis").build();
        }
    }
}
