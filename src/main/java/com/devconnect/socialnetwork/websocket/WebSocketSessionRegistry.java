package com.devconnect.socialnetwork.websocket;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import jakarta.annotation.PreDestroy;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Component
public class WebSocketSessionRegistry {

    private static final Logger log = LoggerFactory.getLogger(WebSocketSessionRegistry.class);

    private final ConcurrentHashMap<String, Set<WebSocketSession>> sessions = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Instant> lastActivity = new ConcurrentHashMap<>();
    private final ExecutorService writers = Executors.newCachedThreadPool(runnable -> {
        Thread thread = new Thread(runnable, "devconnect-ws");
        thread.setDaemon(true);
        return thread;
    });

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

    /**
     * Queue one write per open socket. A slow or half-open socket must not delay delivery to another window.
     */
    public void send(String userId, String json) {
        Set<WebSocketSession> userSessions = sessions.get(userId);
        if (userSessions == null) {
            return;
        }
        for (WebSocketSession session : List.copyOf(userSessions)) {
            if (!session.isOpen()) {
                continue;
            }
            writers.execute(() -> write(userId, session, json));
        }
    }

    @PreDestroy
    public void close() {
        writers.shutdownNow();
    }

    private void write(String userId, WebSocketSession session, String json) {
        if (!session.isOpen()) {
            return;
        }
        try {
            synchronized (session) {
                if (session.isOpen()) {
                    session.sendMessage(new TextMessage(json));
                }
            }
        } catch (Exception ex) {
            log.warn("WebSocket delivery failed userId={} sessionId={}", userId, session.getId());
            remove(userId, session);
            try {
                session.close();
            } catch (IOException ignored) {
                // The failed socket is already unusable.
            }
        }
    }
}
