package com.devconnect.socialnetwork.service;

import com.devconnect.socialnetwork.domain.AccountType;
import com.devconnect.socialnetwork.domain.RelationshipView;
import com.devconnect.socialnetwork.dto.response.PresenceView;
import com.devconnect.socialnetwork.entity.RelationshipEntity;
import com.devconnect.socialnetwork.entity.UserEntity;
import com.devconnect.socialnetwork.repository.BlockRepository;
import com.devconnect.socialnetwork.repository.RelationshipRepository;
import com.devconnect.socialnetwork.util.Ids;
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
    private final BlockRepository blockRepository;
    private final UserRepository userRepository;
    private final Clock clock;
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor(runnable -> {
        Thread thread = new Thread(runnable, "devconnect-presence");
        thread.setDaemon(true);
        return thread;
    });
    private final ConcurrentHashMap<String, ScheduledFuture<?>> offlineTimers = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Object> presenceLocks = new ConcurrentHashMap<>();

    public PresenceService(
            WebSocketSessionRegistry registry,
            RealtimePublisher publisher,
            RelationshipRepository relationshipRepository,
            BlockRepository blockRepository,
            UserRepository userRepository,
            Clock clock
    ) {
        this.registry = registry;
        this.publisher = publisher;
        this.relationshipRepository = relationshipRepository;
        this.blockRepository = blockRepository;
        this.userRepository = userRepository;
        this.clock = clock;
        scheduler.scheduleAtFixedRate(this::closeStaleSockets, 20, 20, TimeUnit.SECONDS);
    }

    public void connected(String userId) {
        synchronized (lock(userId)) {
            cancelOffline(userId);
            if (registry.openCount(userId) <= 1) {
                announce(userId, "ONLINE", null);
            }
        }
        sendOnlineFriends(userId);
    }

    public void disconnected(String userId) {
        synchronized (lock(userId)) {
            if (registry.openCount(userId) > 0) {
                return;
            }
            cancelOffline(userId);
            ScheduledFuture<?> pending = scheduler.schedule(() -> markOffline(userId), OFFLINE_GRACE.toSeconds(), TimeUnit.SECONDS);
            offlineTimers.put(userId, pending);
        }
    }

    public PresenceView visible(String viewerId, UserEntity target, RelationshipView relationship) {
        if (viewerId == null || target == null || target.getId() == null) {
            return null;
        }
        boolean self = viewerId.equals(target.getId());
        if (!self && !PresencePolicy.canSee(
                eitherBlocked(viewerId, target.getId()),
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
        synchronized (lock(userId)) {
            offlineTimers.remove(userId);
            if (registry.isOnline(userId)) {
                return;
            }
            Instant seen = clock.instant();
            userRepository.findById(userId).ifPresent(user -> {
                if (registry.isOnline(userId)) {
                    return;
                }
                user.setLastSeenAt(seen);
                userRepository.save(user);
            });
            if (registry.isOnline(userId)) {
                return;
            }
            announce(userId, "OFFLINE", seen);
        }
    }

    private Object lock(String userId) {
        return presenceLocks.computeIfAbsent(userId, ignored -> new Object());
    }

    public Map<String, Object> visibleSnapshot(String viewerId, String subjectId) {
        if (eitherBlocked(viewerId, subjectId) || !areFriends(viewerId, subjectId)) {
            return null;
        }
        UserEntity subject = userRepository.findById(subjectId).orElse(null);
        if (subject == null || !PresencePolicy.activityVisible(subject.getShowActivityStatus())) {
            return null;
        }
        if (registry.isOnline(subjectId)) {
            return payload(subjectId, "ONLINE", null);
        }
        return payload(subjectId, "OFFLINE", subject.getLastSeenAt());
    }

    private boolean areFriends(String firstUserId, String secondUserId) {
        String[] pair = Ids.orderedPair(firstUserId, secondUserId);
        return relationshipRepository.existsByUserAIdAndUserBId(pair[0], pair[1]);
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
            if (!eitherBlocked(userId, friendId)) {
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
            if (eitherBlocked(userId, friendId)) {
                continue;
            }
            publisher.publish(userId, "PRESENCE_UPDATE", payload(friendId, "ONLINE", null));
            sent += 1;
        }
    }

    private boolean eitherBlocked(String firstUserId, String secondUserId) {
        return blockRepository.existsByBlockerIdAndBlockedId(firstUserId, secondUserId)
                || blockRepository.existsByBlockerIdAndBlockedId(secondUserId, firstUserId);
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
