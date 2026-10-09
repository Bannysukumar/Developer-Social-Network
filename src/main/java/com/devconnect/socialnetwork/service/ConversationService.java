package com.devconnect.socialnetwork.service;

import com.devconnect.socialnetwork.domain.AccountStatus;
import com.devconnect.socialnetwork.domain.ConversationType;
import com.devconnect.socialnetwork.dto.PageResponse;
import com.devconnect.socialnetwork.dto.WriteResult;
import com.devconnect.socialnetwork.dto.response.ConversationResponse;
import com.devconnect.socialnetwork.entity.ConversationEntity;
import com.devconnect.socialnetwork.entity.UserEntity;
import com.devconnect.socialnetwork.exception.ForbiddenException;
import com.devconnect.socialnetwork.exception.InvalidStateException;
import com.devconnect.socialnetwork.exception.ResourceNotFoundException;
import com.devconnect.socialnetwork.repository.ConversationRepository;
import com.devconnect.socialnetwork.repository.UserRepository;
import com.devconnect.socialnetwork.util.Ids;
import com.devconnect.socialnetwork.util.Paging;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.util.List;

@Service
public class ConversationService {

    private final ConversationRepository repository;
    private final UserRepository userRepository;
    private final FriendshipService friendshipService;
    private final BlockService blockService;
    private final MongoTemplate mongoTemplate;
    private final Clock clock;

    public ConversationService(
            ConversationRepository repository,
            UserRepository userRepository,
            FriendshipService friendshipService,
            BlockService blockService,
            MongoTemplate mongoTemplate,
            Clock clock
    ) {
        this.repository = repository;
        this.userRepository = userRepository;
        this.friendshipService = friendshipService;
        this.blockService = blockService;
        this.mongoTemplate = mongoTemplate;
        this.clock = clock;
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
