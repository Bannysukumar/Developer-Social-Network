package com.devconnect.socialnetwork.service;

import com.devconnect.socialnetwork.domain.AuditEventType;
import com.devconnect.socialnetwork.domain.FriendRequestStatus;
import com.devconnect.socialnetwork.dto.response.BlockStatusResponse;
import com.devconnect.socialnetwork.entity.BlockEntity;
import com.devconnect.socialnetwork.entity.UserEntity;
import com.devconnect.socialnetwork.exception.ForbiddenException;
import com.devconnect.socialnetwork.exception.InvalidStateException;
import com.devconnect.socialnetwork.exception.ResourceNotFoundException;
import com.devconnect.socialnetwork.repository.BlockRepository;
import com.devconnect.socialnetwork.websocket.RealtimePublisher;
import com.devconnect.socialnetwork.repository.UserRepository;
import com.devconnect.socialnetwork.util.Ids;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class BlockService {

    private final BlockRepository blockRepository;
    private final UserRepository userRepository;
    private final FriendshipService friendshipService;
    private final AuditService auditService;
    private final MongoTemplate mongoTemplate;
    private final RealtimePublisher realtimePublisher;
    private final PresenceService presenceService;
    private final Clock clock;

    public BlockService(
            BlockRepository blockRepository,
            UserRepository userRepository,
            FriendshipService friendshipService,
            AuditService auditService,
            MongoTemplate mongoTemplate,
            RealtimePublisher realtimePublisher,
            PresenceService presenceService,
            Clock clock
    ) {
        this.blockRepository = blockRepository;
        this.userRepository = userRepository;
        this.friendshipService = friendshipService;
        this.auditService = auditService;
        this.mongoTemplate = mongoTemplate;
        this.realtimePublisher = realtimePublisher;
        this.presenceService = presenceService;
        this.clock = clock;
    }

    public boolean eitherBlocked(String firstUserId, String secondUserId) {
        return blockRepository.existsByBlockerIdAndBlockedId(firstUserId, secondUserId)
                || blockRepository.existsByBlockerIdAndBlockedId(secondUserId, firstUserId);
    }

    public void assertCanInteract(String firstUserId, String secondUserId) {
        if (eitherBlocked(firstUserId, secondUserId)) {
            throw new ForbiddenException("You can't interact with this account.");
        }
    }

    public Set<String> hiddenUserIds(String userId) {
        Set<String> hidden = new HashSet<>();
        blockRepository.findByBlockerIdOrBlockedId(userId, userId).forEach(block -> {
            if (block.getBlockerId().equals(userId)) {
                hidden.add(block.getBlockedId());
            } else {
                hidden.add(block.getBlockerId());
            }
        });
        return hidden;
    }

    public Set<String> blockedByMe(String userId, Collection<String> otherIds) {
        Set<String> ids = new HashSet<>();
        blockRepository.findByBlockerIdAndBlockedIdIn(userId, otherIds)
                .forEach(block -> ids.add(block.getBlockedId()));
        return ids;
    }

    public List<String> blockedUserIds(String userId) {
        return blockRepository.findByBlockerId(userId).stream().map(BlockEntity::getBlockedId).toList();
    }

    public BlockStatusResponse status(String userId, String targetUserId) {
        Ids.require(targetUserId);
        requireActiveUser(targetUserId);
        return new BlockStatusResponse(
                blockRepository.existsByBlockerIdAndBlockedId(userId, targetUserId),
                blockRepository.existsByBlockerIdAndBlockedId(targetUserId, userId)
        );
    }

    public BlockStatusResponse block(String userId, String targetUserId) {
        Ids.require(targetUserId);
        if (userId.equals(targetUserId)) {
            throw new InvalidStateException("You cannot block yourself");
        }
        requireActiveUser(targetUserId);
        if (!blockRepository.existsByBlockerIdAndBlockedId(userId, targetUserId)) {
            BlockEntity block = new BlockEntity();
            block.setId(Ids.newId());
            block.setBlockerId(userId);
            block.setBlockedId(targetUserId);
            block.setCreatedAt(clock.instant());
            blockRepository.save(block);
            cancelPending(userId, targetUserId);
            auditService.record(AuditEventType.USER_BLOCKED, userId, Map.of("targetUserId", targetUserId));
        }
        publishBlockState(userId, targetUserId);
        return status(userId, targetUserId);
    }

    public BlockStatusResponse unblock(String userId, String targetUserId) {
        Ids.require(targetUserId);
        requireActiveUser(targetUserId);
        if (blockRepository.findByBlockerIdAndBlockedId(userId, targetUserId).isEmpty()) {
            throw new ResourceNotFoundException("Resource not found");
        }
        blockRepository.deleteByBlockerIdAndBlockedId(userId, targetUserId);
        auditService.record(AuditEventType.USER_UNBLOCKED, userId, Map.of("targetUserId", targetUserId));
        publishBlockState(userId, targetUserId);
        return status(userId, targetUserId);
    }

    public void deleteAllForUser(String userId) {
        blockRepository.deleteByBlockerIdOrBlockedId(userId, userId);
    }

    private void publishBlockState(String actorId, String otherId) {
        realtimePublisher.publish(actorId, "BLOCK_STATE", blockFrame(actorId, otherId));
        realtimePublisher.publish(otherId, "BLOCK_STATE", blockFrame(otherId, actorId));
    }

    private Map<String, Object> blockFrame(String viewerId, String otherId) {
        BlockStatusResponse view = status(viewerId, otherId);
        Map<String, Object> frame = new LinkedHashMap<>();
        frame.put("userId", otherId);
        frame.put("blockedByMe", view.blockedByMe());
        frame.put("blockedMe", view.blockedMe());
        Map<String, Object> presence = presenceService.visibleSnapshot(viewerId, otherId);
        if (presence != null) {
            frame.put("presence", presence);
        }
        return frame;
    }

    private void cancelPending(String firstUserId, String secondUserId) {
        Query query = Query.query(new Criteria().andOperator(
                Criteria.where("status").is(FriendRequestStatus.PENDING),
                new Criteria().orOperator(
                        new Criteria().andOperator(
                                Criteria.where("senderId").is(firstUserId),
                                Criteria.where("recipientId").is(secondUserId)),
                        new Criteria().andOperator(
                                Criteria.where("senderId").is(secondUserId),
                                Criteria.where("recipientId").is(firstUserId))
                )
        ));
        mongoTemplate.updateMulti(query,
                new Update().set("status", FriendRequestStatus.CANCELLED).set("updatedAt", clock.instant()),
                com.devconnect.socialnetwork.entity.FriendRequestEntity.class);
    }

    private UserEntity requireActiveUser(String userId) {
        UserEntity user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("Resource not found"));
        if (user.getStatus() != com.devconnect.socialnetwork.domain.AccountStatus.ACTIVE) {
            throw new ResourceNotFoundException("Resource not found");
        }
        return user;
    }
}
