package com.devconnect.socialnetwork.websocket;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class WebSocketSessionRegistry {

    private static final Logger log = LoggerFactory.getLogger(WebSocketSessionRegistry.class);

    private final ConcurrentHashMap<String, Set<WebSocketSession>> sessions = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Instant> lastActivity = new ConcurrentHashMap<>();

    public void add(String userId, WebSocketSession session) {
        sessions.computeIfAbsent(userId, ignored -> ConcurrentHashMap.newKeySet()).add(session);
        touch(session);
    }

    public void touch(WebSocketSession session) {
        lastActivity.put(session.getId(), Instant.now());
    }

    public void remove(String userId, WebSocketSession session) {
        Set<WebSocketSession> userSessions = sessions.get(userId);
        if (userSessions == null) {
            return;
        }
        userSessions.remove(session);
        lastActivity.remove(session.getId());
        if (userSessions.isEmpty()) {
            sessions.remove(userId, userSessions);
        }
    }

    public int openCount(String userId) {
        Set<WebSocketSession> userSessions = sessions.get(userId);
        if (userSessions == null) {
            return 0;
        }
        return (int) userSessions.stream().filter(WebSocketSession::isOpen).count();
    }

    public List<WebSocketSession> staleSessions(Duration maxAge, Instant now) {
        List<WebSocketSession> stale = new ArrayList<>();
        for (Set<WebSocketSession> userSessions : sessions.values()) {
            for (WebSocketSession session : userSessions) {
                Instant seen = lastActivity.get(session.getId());
                if (session.isOpen() && (seen == null || seen.plus(maxAge).isBefore(now))) {
                    stale.add(session);
                }
            }
        }
        return stale;
    }

    public boolean isOnline(String userId) {
        Set<WebSocketSession> userSessions = sessions.get(userId);
        return userSessions != null && userSessions.stream().anyMatch(WebSocketSession::isOpen);
    }

    public void send(String userId, String json) {
        Set<WebSocketSession> userSessions = sessions.get(userId);
        if (userSessions == null) {
            return;
        }
        for (WebSocketSession session : userSessions) {
            if (!session.isOpen()) {
                continue;
            }
            try {
                synchronized (session) {
                    session.sendMessage(new TextMessage(json));
                }
            } catch (IOException ex) {
                log.warn("WebSocket delivery failed userId={}", userId);
            }
        }
    }
}
