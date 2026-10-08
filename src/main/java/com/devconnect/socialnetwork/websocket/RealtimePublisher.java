package com.devconnect.socialnetwork.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/** Sends one JSON frame to every open socket for a user. */
@Component
public class RealtimePublisher {

    private static final Logger log = LoggerFactory.getLogger(RealtimePublisher.class);

    private final WebSocketSessionRegistry registry;
    private final ObjectMapper objectMapper;

    public RealtimePublisher(WebSocketSessionRegistry registry, ObjectMapper objectMapper) {
        this.registry = registry;
        this.objectMapper = objectMapper;
    }

    public void publish(String userId, String type, Object data) {
        if (userId == null || userId.isBlank()) {
            return;
        }
        try {
            Map<String, Object> frame = new LinkedHashMap<>();
            frame.put("type", type);
            frame.put("data", data);
            registry.send(userId, objectMapper.writeValueAsString(frame));
        } catch (Exception ex) {
            log.warn("Realtime frame was not sent type={} userId={}", type, userId);
        }
    }
}
