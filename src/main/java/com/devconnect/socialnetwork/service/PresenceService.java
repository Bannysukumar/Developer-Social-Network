package com.devconnect.socialnetwork.service;

import com.devconnect.socialnetwork.domain.AccountType;
import com.devconnect.socialnetwork.domain.RelationshipView;
import com.devconnect.socialnetwork.dto.response.PresenceView;
import com.devconnect.socialnetwork.entity.RelationshipEntity;
import com.devconnect.socialnetwork.entity.UserEntity;
import com.devconnect.socialnetwork.repository.RelationshipRepository;
import com.devconnect.socialnetwork.repository.UserRepository;
import com.devconnect.socialnetwork.websocket.RealtimePublisher;
import com.devconnect.socialnetwork.websocket.WebSocketSessionRegistry;
import jakarta.annotation.PreDestroy;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

/**
 * Presence lives in this process. The deployment runs one backend instance, so a shared store is not required.
 * Last seen is written once when the last socket goes idle, not on every heartbeat.
 */
@Service
public class PresenceService {

    static final Duration HEARTBEAT_LIMIT = Duration.ofSeconds(50);
    static final Duration OFFLINE_GRACE = Duration.ofSeconds(20);
    private static final int FRIEND_LIMIT = 200;

    private final WebSocketSessionRegistry registry;
    private final RealtimePublisher publisher;
    private final RelationshipRepository relationshipRepository;
    private final BlockService blockService;
    private final UserRepository userRepository;
    private final Clock clock;
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor(runnable -> {
        Thread thread = new Thread(runnable, "devconnect-presence");
        thread.setDaemon(true);
        return thread;
    });
    private final ConcurrentHashMap<String, ScheduledFuture<?>> offlineTimers = new ConcurrentHashMap<>();

    public PresenceService(
            WebSocketSessionRegistry registry,
            RealtimePublisher publisher,
            RelationshipRepository relationshipRepository,
            BlockService blockService,
            UserRepository userRepository,
            Clock clock
    ) {
        this.registry = registry;
        this.publisher = publisher;
        this.relationshipRepository = relationshipRepository;
        this.blockService = blockService;
        this.userRepository = userRepository;
        this.clock = clock;
        scheduler.scheduleAtFixedRate(this::closeStaleSockets, 20, 20, TimeUnit.SECONDS);
    }

    public void connected(String userId) {
        cancelOffline(userId);
        if (registry.openCount(userId) <= 1) {
            announce(userId, "ONLINE", null);
        }
        sendOnlineFriends(userId);
    }

    public void disconnected(String userId) {
        if (registry.openCount(userId) > 0) {
            return;
        }
        cancelOffline(userId);
        ScheduledFuture<?> pending = scheduler.schedule(() -> markOffline(userId), OFFLINE_GRACE.toSeconds(), TimeUnit.SECONDS);
        offlineTimers.put(userId, pending);
    }

    public PresenceView visible(String viewerId, UserEntity target, RelationshipView relationship) {
        if (viewerId == null || target == null || target.getId() == null) {
            return null;
        }
        boolean self = viewerId.equals(target.getId());
        if (!self && !PresencePolicy.canSee(
                blockService.eitherBlocked(viewerId, target.getId()),
                PresencePolicy.activityVisible(target.getShowActivityStatus()),
                target.getAccountType() == null ? AccountType.PUBLIC : target.getAccountType(),
                relationship
        )) {
            return null;
        }
        if (registry.isOnline(target.getId())) {
            return new PresenceView("ONLINE", null);
        }
        if (!self && relationship != RelationshipView.FRIENDS) {
            return null;
        }
        Instant lastSeenAt = target.getLastSeenAt();
        return new PresenceView("OFFLINE", lastSeenAt);
    }

    @PreDestroy
    public void stop() {
        scheduler.shutdownNow();
    }

    private void markOffline(String userId) {
        offlineTimers.remove(userId);
        if (registry.isOnline(userId)) {
            return;
        }
        Instant seen = clock.instant();
        userRepository.findById(userId).ifPresent(user -> {
            user.setLastSeenAt(seen);
            userRepository.save(user);
        });
        announce(userId, "OFFLINE", seen);
    }

    private void announce(String userId, String status, Instant lastSeenAt) {
        UserEntity user = userRepository.findById(userId).orElse(null);
        if (user == null || !PresencePolicy.activityVisible(user.getShowActivityStatus())) {
            return;
        }
        Map<String, Object> payload = payload(userId, status, lastSeenAt);
        int sent = 0;
        for (String friendId : friendIds(userId)) {
            if (sent >= FRIEND_LIMIT) {
                break;
            }
            if (!blockService.eitherBlocked(userId, friendId)) {
                publisher.publish(friendId, "PRESENCE_UPDATE", payload);
                sent += 1;
            }
        }
    }

    private void sendOnlineFriends(String userId) {
        int sent = 0;
        for (String friendId : friendIds(userId)) {
            if (sent >= FRIEND_LIMIT) {
                break;
            }
            if (!registry.isOnline(friendId)) {
                continue;
            }
            UserEntity friend = userRepository.findById(friendId).orElse(null);
            if (friend == null || !PresencePolicy.activityVisible(friend.getShowActivityStatus())) {
                continue;
            }
            if (blockService.eitherBlocked(userId, friendId)) {
                continue;
            }
            publisher.publish(userId, "PRESENCE_UPDATE", payload(friendId, "ONLINE", null));
            sent += 1;
        }
    }

    private List<String> friendIds(String userId) {
        return relationshipRepository.findByUserAIdOrUserBId(userId, userId).stream()
                .map(relationship -> otherId(relationship, userId))
                .filter(id -> id != null && !id.isBlank())
                .limit(FRIEND_LIMIT)
                .toList();
    }

    private static String otherId(RelationshipEntity relationship, String userId) {
        if (userId.equals(relationship.getUserAId())) {
            return relationship.getUserBId();
        }
        return relationship.getUserAId();
    }

    private static Map<String, Object> payload(String userId, String status, Instant lastSeenAt) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("userId", userId);
        payload.put("status", status);
        if (lastSeenAt != null) {
            payload.put("lastSeenAt", lastSeenAt.toString());
        }
        return payload;
    }

    private void cancelOffline(String userId) {
        ScheduledFuture<?> pending = offlineTimers.remove(userId);
        if (pending != null) {
            pending.cancel(false);
        }
    }

    private void closeStaleSockets() {
        for (WebSocketSession session : registry.staleSessions(HEARTBEAT_LIMIT, Instant.now())) {
            try {
                session.close(CloseStatus.GOING_AWAY);
            } catch (Exception ignored) {
                // The close callback still removes the session when the transport ends.
            }
        }
    }
}
