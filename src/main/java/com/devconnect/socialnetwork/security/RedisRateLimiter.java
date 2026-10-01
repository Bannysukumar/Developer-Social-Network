package com.devconnect.socialnetwork.security;

import org.springframework.data.redis.core.StringRedisTemplate;

import java.time.Duration;

public class RedisRateLimiter implements RateLimiter {

    private final StringRedisTemplate redis;

    public RedisRateLimiter(StringRedisTemplate redis) {
        this.redis = redis;
    }

    @Override
    public boolean tryAcquire(String key, int limit, Duration window) {
        String redisKey = "rate:" + key;
        Long count = redis.opsForValue().increment(redisKey);
        if (count != null && count == 1L) {
            redis.expire(redisKey, window);
        }
        return count != null && count <= limit;
    }

    @Override
    public boolean ping() {
        String pong = redis.getConnectionFactory().getConnection().ping();
        return pong != null;
    }
}
