package com.devconnect.socialnetwork.service;

import com.devconnect.socialnetwork.domain.AccountStatus;
import com.devconnect.socialnetwork.domain.ConversationType;
import com.devconnect.socialnetwork.dto.PageResponse;
import com.devconnect.socialnetwork.dto.WriteResult;
import com.devconnect.socialnetwork.dto.response.ClearHistoryResponse;
import com.devconnect.socialnetwork.dto.response.ConversationResponse;
import com.devconnect.socialnetwork.entity.ConversationEntity;
import com.devconnect.socialnetwork.entity.MessageEntity;
import com.devconnect.socialnetwork.entity.UserEntity;
import com.devconnect.socialnetwork.exception.ForbiddenException;
import com.devconnect.socialnetwork.exception.InvalidStateException;
import com.devconnect.socialnetwork.exception.ResourceNotFoundException;
import com.devconnect.socialnetwork.repository.ConversationRepository;
import com.devconnect.socialnetwork.repository.UserRepository;
import com.devconnect.socialnetwork.util.Ids;
import com.devconnect.socialnetwork.util.Paging;
import com.devconnect.socialnetwork.websocket.RealtimePublisher;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

@Service
public class ConversationService {

    private final ConversationRepository repository;
    private final UserRepository userRepository;
    private final FriendshipService friendshipService;
    private final BlockService blockService;
    private final MongoTemplate mongoTemplate;
    private final Clock clock;
    private final RealtimePublisher realtimePublisher;

    public ConversationService(
            ConversationRepository repository,
            UserRepository userRepository,
            FriendshipService friendshipService,
            BlockService blockService,
            MongoTemplate mongoTemplate,
            Clock clock,
            RealtimePublisher realtimePublisher
    ) {
        this.repository = repository;
        this.userRepository = userRepository;
        this.friendshipService = friendshipService;
        this.blockService = blockService;
        this.mongoTemplate = mongoTemplate;
        this.clock = clock;
        this.realtimePublisher = realtimePublisher;
    }

    public WriteResult<ConversationResponse> create(String userId, String participantId) {
        Ids.require(participantId);
        if (userId.equals(participantId)) {
            throw new InvalidStateException("A conversation requires another user");
        }
        UserEntity other = userRepository.findById(participantId)
                .orElseThrow(() -> new ResourceNotFoundException("Resource not found"));
        if (other.getStatus() != AccountStatus.ACTIVE) {
            throw new ResourceNotFoundException("Resource not found");
        }
        blockService.assertCanInteract(userId, participantId);
        if (!friendshipService.areFriends(userId, participantId)) {
            throw new ForbiddenException("Only friends can start a conversation");
        }
        String key = Ids.conversationKey(userId, participantId);
        var existing = repository.findByParticipantKey(key);
        if (existing.isPresent()) {
            return new WriteResult<>(toResponse(existing.get()), false);
        }
        ConversationEntity samePair = oldestPair(userId, participantId);
        if (samePair != null) {
            if (samePair.getParticipantKey() == null || samePair.getParticipantKey().isBlank()) {
                samePair.setParticipantKey(key);
                try {
                    repository.save(samePair);
                } catch (DuplicateKeyException ignored) {
                    // Another request already claimed this pair.
                }
            }
            return new WriteResult<>(toResponse(samePair), false);
        }
        ConversationEntity conversation = new ConversationEntity();
        conversation.setId(Ids.newId());
        conversation.setType(ConversationType.ONE_TO_ONE);
        String[] pair = Ids.orderedPair(userId, participantId);
        conversation.setParticipantIds(List.of(pair[0], pair[1]));
        conversation.setParticipantKey(key);
        conversation.setCreatedAt(clock.instant());
        conversation.setUpdatedAt(clock.instant());
        try {
            repository.save(conversation);
            return new WriteResult<>(toResponse(conversation), true);
        } catch (DuplicateKeyException ex) {
            ConversationEntity concurrent = repository.findByParticipantKey(key)
                    .orElseThrow(() -> new InvalidStateException("Conversation already exists"));
            return new WriteResult<>(toResponse(concurrent), false);
        }
    }

    public PageResponse<ConversationResponse> list(String userId, int page, int size) {
        Pageable pageable = Paging.page(page, size, 50, Sort.by(Sort.Direction.DESC, "updatedAt"));
        Criteria criteria = Criteria.where("participantIds").is(userId);
        Query query = Query.query(criteria);
        long total = mongoTemplate.count(query, ConversationEntity.class);
        query.with(pageable);
        List<ConversationResponse> items = mongoTemplate.find(query, ConversationEntity.class).stream()
                .map(this::toResponse)
                .toList();
        int totalPages = pageable.getPageSize() == 0 ? 0 : (int) Math.ceil((double) total / pageable.getPageSize());
        return new PageResponse<>(items, pageable.getPageNumber(), pageable.getPageSize(), total, totalPages,
                (long) (pageable.getPageNumber() + 1) * pageable.getPageSize() < total);
    }

    public ConversationResponse get(String userId, String conversationId) {
        return toResponse(requireMember(userId, conversationId));
    }

    /**
     * Hides this participant's view of messages created at or before now.
     * Shared ciphertext stays so the other participant's history is unchanged.
     * Messages created after this instant, including ones that arrive while this user is offline, stay visible.
     * Calling it again moves only this user's boundary forward.
     */
    public ClearHistoryResponse clearHistory(String userId, String conversationId) {
        List<String> conversationIds = relatedConversationIds(userId, conversationId);
        Instant clearedAt = clock.instant();
        for (String id : conversationIds) {
            ConversationEntity conversation = requireMember(userId, id);
            conversation.getHistoryClearedAt().put(userId, clearedAt);
            repository.save(conversation);
        }
        mongoTemplate.updateMulti(
                Query.query(Criteria.where("conversationId").in(conversationIds)
                        .and("createdAt").lte(clearedAt)
                        .and("deletedForUserIds").ne(userId)),
                new Update().addToSet("deletedForUserIds", userId),
                MessageEntity.class
        );
        realtimePublisher.publish(userId, "HISTORY_CLEARED", Map.of(
                "conversationId", conversationId,
                "clearedAt", clearedAt.toString()
        ));
        return new ClearHistoryResponse(conversationId, clearedAt);
    }

    public Instant historyClearedAt(String userId, String conversationId) {
        ConversationEntity conversation = requireMember(userId, conversationId);
        return conversation.getHistoryClearedAt().get(userId);
    }

    public boolean hiddenByHistoryClear(String userId, String conversationId, Instant createdAt) {
        if (createdAt == null) {
            return false;
        }
        Instant clearedAt = historyClearedAt(userId, conversationId);
        return clearedAt != null && !createdAt.isAfter(clearedAt);
    }

    /** Every one-to-one conversation for this pair, including older rows saved before the pair key existed. */
    public List<String> relatedConversationIds(String userId, String conversationId) {
        ConversationEntity current = requireMember(userId, conversationId);
        if (current.getParticipantIds() == null || current.getParticipantIds().size() != 2) {
            return List.of(conversationId);
        }
        String first = current.getParticipantIds().get(0);
        String second = current.getParticipantIds().get(1);
        Query query = Query.query(Criteria.where("participantIds").all(first, second)
                .and("type").is(ConversationType.ONE_TO_ONE));
        List<String> ids = mongoTemplate.find(query, ConversationEntity.class).stream()
                .filter(item -> item.getParticipantIds() != null && item.getParticipantIds().contains(userId))
                .map(ConversationEntity::getId)
                .distinct()
                .toList();
        return ids.isEmpty() ? List.of(conversationId) : ids;
    }

    private ConversationEntity oldestPair(String userId, String participantId) {
        Query query = Query.query(Criteria.where("participantIds").all(userId, participantId)
                .and("type").is(ConversationType.ONE_TO_ONE));
        return mongoTemplate.find(query, ConversationEntity.class).stream()
                .filter(item -> item.getParticipantIds() != null && item.getParticipantIds().contains(userId))
                .min(Comparator.comparing(item -> item.getCreatedAt() == null ? Instant.EPOCH : item.getCreatedAt()))
                .orElse(null);
    }

    public ConversationEntity requireMember(String userId, String conversationId) {
        Ids.require(conversationId);
        ConversationEntity conversation = repository.findById(conversationId)
                .orElseThrow(() -> new ResourceNotFoundException("Resource not found"));
        if (conversation.getParticipantIds() == null || !conversation.getParticipantIds().contains(userId)) {
            throw new ResourceNotFoundException("Resource not found");
        }
        if (conversation.getType() != ConversationType.ONE_TO_ONE || conversation.getParticipantIds().size() != 2) {
            throw new InvalidStateException("Conversation is invalid");
        }
        return conversation;
    }

    public void touch(ConversationEntity conversation) {
        conversation.setUpdatedAt(clock.instant());
        repository.save(conversation);
    }

    private ConversationResponse toResponse(ConversationEntity conversation) {
        return new ConversationResponse(
                conversation.getId(),
                conversation.getType(),
                List.copyOf(conversation.getParticipantIds()),
                conversation.getCreatedAt(),
                conversation.getUpdatedAt()
        );
    }
}
