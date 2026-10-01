package com.trivexa.socialnetwork.security;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
@ConditionalOnProperty(name = "app.rate-limit.store", havingValue = "memory", matchIfMissing = true)
public class InMemoryRateLimiter implements RateLimiter {

    private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();

    @Override
    public boolean tryAcquire(String key, int limit, Duration window) {
        long now = System.currentTimeMillis();
        long windowMs = window.toMillis();
        Window current = windows.compute(key, (ignored, existing) -> {
            if (existing == null || now - existing.startMs >= windowMs) {
                return new Window(now, 1);
            }
            existing.count++;
            return existing;
        });
        if (windows.size() > 10_000) {
            cleanup(now);
        }
        return current.count <= limit;
    }

    private void cleanup(long now) {
        var expired = new ArrayList<String>();
        for (Map.Entry<String, Window> entry : windows.entrySet()) {
            if (now - entry.getValue().startMs > Duration.ofHours(2).toMillis()) {
                expired.add(entry.getKey());
            }
        }
        expired.forEach(windows::remove);
    }

    private static final class Window {
        private final long startMs;
        private int count;

        private Window(long startMs, int count) {
            this.startMs = startMs;
            this.count = count;
        }
    }
}
