package com.devconnect.socialnetwork.service;

import com.devconnect.socialnetwork.domain.AccountStatus;
import com.devconnect.socialnetwork.domain.FriendRequestStatus;
import com.devconnect.socialnetwork.domain.NotificationType;
import com.devconnect.socialnetwork.domain.RelationshipView;
import com.devconnect.socialnetwork.dto.PageResponse;
import com.devconnect.socialnetwork.dto.WriteResult;
import com.devconnect.socialnetwork.dto.response.FriendRequestResponse;
import com.devconnect.socialnetwork.entity.FriendRequestEntity;
import com.devconnect.socialnetwork.entity.UserEntity;
import com.devconnect.socialnetwork.exception.ForbiddenException;
import com.devconnect.socialnetwork.exception.InvalidStateException;
import com.devconnect.socialnetwork.exception.ResourceNotFoundException;
import com.devconnect.socialnetwork.mapper.UserMapper;
import com.devconnect.socialnetwork.repository.FriendRequestRepository;
import com.devconnect.socialnetwork.repository.UserRepository;
import com.devconnect.socialnetwork.util.Ids;
import com.devconnect.socialnetwork.util.Paging;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.FindAndModifyOptions;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class FriendRequestService {

    private final FriendRequestRepository repository;
    private final UserRepository userRepository;
    private final BlockService blockService;
    private final FriendshipService friendshipService;
    private final NotificationService notificationService;
    private final UserMapper userMapper;
    private final MongoTemplate mongoTemplate;
    private final Clock clock;

    public FriendRequestService(
            FriendRequestRepository repository,
            UserRepository userRepository,
            BlockService blockService,
            FriendshipService friendshipService,
            NotificationService notificationService,
            UserMapper userMapper,
            MongoTemplate mongoTemplate,
            Clock clock
    ) {
        this.repository = repository;
        this.userRepository = userRepository;
        this.blockService = blockService;
        this.friendshipService = friendshipService;
        this.notificationService = notificationService;
        this.userMapper = userMapper;
        this.mongoTemplate = mongoTemplate;
        this.clock = clock;
    }

    public WriteResult<FriendRequestResponse> send(String senderId, String recipientId) {
        Ids.require(recipientId);
        if (senderId.equals(recipientId)) {
            throw new InvalidStateException("You cannot send a friend request to yourself");
        }
        UserEntity recipient = activeUser(recipientId);
        UserEntity sender = activeUser(senderId);
        blockService.assertCanInteract(senderId, recipientId);
        if (friendshipService.areFriends(senderId, recipientId)) {
            throw new InvalidStateException("You are already friends");
        }
        repository.findBySenderIdAndRecipientIdAndStatus(recipientId, senderId, FriendRequestStatus.PENDING)
                .ifPresent(existing -> {
                    throw new InvalidStateException("An incoming friend request already exists");
                });
        var existing = repository.findBySenderIdAndRecipientIdAndStatus(senderId, recipientId, FriendRequestStatus.PENDING);
        if (existing.isPresent()) {
            return new WriteResult<>(toResponse(existing.get(), senderId), false);
        }
        FriendRequestEntity request = new FriendRequestEntity();
        request.setId(Ids.newId());
        request.setSenderId(senderId);
        request.setRecipientId(recipientId);
        request.setStatus(FriendRequestStatus.PENDING);
        request.setCreatedAt(clock.instant());
        request.setUpdatedAt(clock.instant());
        try {
            repository.save(request);
        } catch (DuplicateKeyException ex) {
            FriendRequestEntity concurrent = repository
                    .findBySenderIdAndRecipientIdAndStatus(senderId, recipientId, FriendRequestStatus.PENDING)
                    .orElseThrow(() -> new InvalidStateException("A friend request already exists"));
            return new WriteResult<>(toResponse(concurrent, senderId), false);
        }
        notificationService.notify(
                recipientId,
                NotificationType.FRIEND_REQUEST,
                senderId,
                request.getId(),
                sender.getDisplayName() + " sent you a friend request"
        );
        return new WriteResult<>(toResponse(request, senderId, recipient), true);
    }

    public FriendRequestResponse cancel(String userId, String requestId) {
        FriendRequestEntity request = visibleRequest(userId, requestId);
        if (!request.getSenderId().equals(userId)) {
            throw new ForbiddenException("Only the sender can cancel this request");
        }
        FriendRequestEntity updated = transition(requestId, userId, true, FriendRequestStatus.CANCELLED);
        return toResponse(updated, userId);
    }

    public FriendRequestResponse accept(String userId, String requestId) {
        FriendRequestEntity request = visibleRequest(userId, requestId);
        if (!request.getRecipientId().equals(userId)) {
            throw new ForbiddenException("Only the recipient can accept this request");
        }
        blockService.assertCanInteract(userId, request.getSenderId());
        FriendRequestEntity updated = transition(requestId, userId, false, FriendRequestStatus.ACCEPTED);
        friendshipService.createFriendship(updated.getSenderId(), updated.getRecipientId());
        UserEntity recipient = activeUser(userId);
        notificationService.notify(
                updated.getSenderId(),
                NotificationType.FRIEND_REQUEST_ACCEPTED,
                userId,
                updated.getId(),
                recipient.getDisplayName() + " accepted your friend request"
        );
        return toResponse(updated, userId);
    }

    public FriendRequestResponse reject(String userId, String requestId) {
        FriendRequestEntity request = visibleRequest(userId, requestId);
        if (!request.getRecipientId().equals(userId)) {
            throw new ForbiddenException("Only the recipient can reject this request");
        }
        FriendRequestEntity updated = transition(requestId, userId, false, FriendRequestStatus.REJECTED);
        return toResponse(updated, userId);
    }

    public PageResponse<FriendRequestResponse> incoming(String userId, int page, int size) {
        Page<FriendRequestEntity> result = repository.findByRecipientIdAndStatus(
                userId, FriendRequestStatus.PENDING, Paging.page(page, size, 50, Sort.by(Sort.Direction.DESC, "createdAt")));
        return Paging.map(result, result.getContent().stream().map(request -> toResponse(request, userId)).toList());
    }

    public PageResponse<FriendRequestResponse> outgoing(String userId, int page, int size) {
        Page<FriendRequestEntity> result = repository.findBySenderIdAndStatus(
                userId, FriendRequestStatus.PENDING, Paging.page(page, size, 50, Sort.by(Sort.Direction.DESC, "createdAt")));
        return Paging.map(result, result.getContent().stream().map(request -> toResponse(request, userId)).toList());
    }

    public Map<String, RelationshipView> pendingViews(String userId, Collection<String> otherIds) {
        Map<String, RelationshipView> views = new HashMap<>();
        repository.findBySenderIdAndRecipientIdInAndStatus(userId, otherIds, FriendRequestStatus.PENDING)
                .forEach(request -> views.put(request.getRecipientId(), RelationshipView.OUTGOING_REQUEST));
        repository.findByRecipientIdAndSenderIdInAndStatus(userId, otherIds, FriendRequestStatus.PENDING)
                .forEach(request -> views.put(request.getSenderId(), RelationshipView.INCOMING_REQUEST));
        return views;
    }

    public void cancelAllForUser(String userId) {
        mongoTemplate.updateMulti(
                Query.query(new Criteria().andOperator(
                        Criteria.where("status").is(FriendRequestStatus.PENDING),
                        new Criteria().orOperator(
                                Criteria.where("senderId").is(userId),
                                Criteria.where("recipientId").is(userId))
                )),
                new Update().set("status", FriendRequestStatus.CANCELLED).set("updatedAt", clock.instant()),
                FriendRequestEntity.class
        );
    }

    private FriendRequestEntity transition(String requestId, String actorId, boolean sender, FriendRequestStatus status) {
        Criteria criteria = Criteria.where("_id").is(requestId).and("status").is(FriendRequestStatus.PENDING);
        if (sender) {
            criteria = criteria.and("senderId").is(actorId);
        } else {
            criteria = criteria.and("recipientId").is(actorId);
        }
        FriendRequestEntity updated = mongoTemplate.findAndModify(
                Query.query(criteria),
                new Update().set("status", status).set("updatedAt", clock.instant()),
                FindAndModifyOptions.options().returnNew(true),
                FriendRequestEntity.class
        );
        if (updated == null) {
            throw new InvalidStateException("Friend request is no longer pending");
        }
        return updated;
    }

    private FriendRequestEntity visibleRequest(String userId, String requestId) {
        Ids.require(requestId);
        FriendRequestEntity request = repository.findById(requestId)
                .orElseThrow(() -> new ResourceNotFoundException("Resource not found"));
        if (!request.getSenderId().equals(userId) && !request.getRecipientId().equals(userId)) {
            throw new ResourceNotFoundException("Resource not found");
        }
        return request;
    }

    private UserEntity activeUser(String userId) {
        UserEntity user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("Resource not found"));
        if (user.getStatus() != AccountStatus.ACTIVE) {
            throw new ResourceNotFoundException("Resource not found");
        }
        return user;
    }

    private FriendRequestResponse toResponse(FriendRequestEntity request, String viewerId) {
        String counterpartId = request.getSenderId().equals(viewerId) ? request.getRecipientId() : request.getSenderId();
        UserEntity counterpart = userRepository.findById(counterpartId).orElse(null);
        return toResponse(request, viewerId, counterpart);
    }

    private FriendRequestResponse toResponse(FriendRequestEntity request, String viewerId, UserEntity counterpart) {
        var summary = counterpart == null ? null : userMapper.toSummary(counterpart, RelationshipView.NONE);
        return new FriendRequestResponse(
                request.getId(),
                request.getSenderId(),
                request.getRecipientId(),
                summary,
                request.getStatus(),
                request.getCreatedAt(),
                request.getUpdatedAt()
        );
    }
}
