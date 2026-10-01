package com.devconnect.socialnetwork.security;

import com.devconnect.socialnetwork.config.AppProperties;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.net.URI;

@Configuration
@ConditionalOnProperty(name = "app.rate-limit.store", havingValue = "redis")
public class RedisRateLimitConfig {

    @Bean
    public RedisConnectionFactory redisConnectionFactory(AppProperties properties) {
        URI uri = URI.create(properties.getRedisUrl());
        RedisStandaloneConfiguration configuration = new RedisStandaloneConfiguration();
        configuration.setHostName(uri.getHost() == null ? "localhost" : uri.getHost());
        configuration.setPort(uri.getPort() > 0 ? uri.getPort() : 6379);
        if (uri.getUserInfo() != null && !uri.getUserInfo().isBlank()) {
            String[] parts = uri.getUserInfo().split(":", 2);
            configuration.setPassword(parts.length == 2 ? parts[1] : parts[0]);
        }
        return new LettuceConnectionFactory(configuration);
    }

    @Bean
    public StringRedisTemplate stringRedisTemplate(RedisConnectionFactory connectionFactory) {
        return new StringRedisTemplate(connectionFactory);
    }

    @Bean
    public RateLimiter redisRateLimiter(StringRedisTemplate template) {
        return new RedisRateLimiter(template);
    }
}
