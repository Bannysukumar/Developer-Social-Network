package com.devconnect.socialnetwork.service;

import com.devconnect.socialnetwork.domain.RelationshipView;
import com.devconnect.socialnetwork.dto.PageResponse;
import com.devconnect.socialnetwork.dto.response.UserSummaryResponse;
import com.devconnect.socialnetwork.entity.RelationshipEntity;
import com.devconnect.socialnetwork.entity.UserEntity;
import com.devconnect.socialnetwork.exception.ResourceNotFoundException;
import com.devconnect.socialnetwork.mapper.UserMapper;
import com.devconnect.socialnetwork.repository.BlockRepository;
import com.devconnect.socialnetwork.repository.RelationshipRepository;
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
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Service
public class FriendshipService {

    private final RelationshipRepository relationshipRepository;
    private final UserRepository userRepository;
    private final BlockRepository blockRepository;
    private final UserMapper userMapper;
    private final MongoTemplate mongoTemplate;
    private final Clock clock;

    public FriendshipService(
            RelationshipRepository relationshipRepository,
            UserRepository userRepository,
            BlockRepository blockRepository,
            UserMapper userMapper,
            MongoTemplate mongoTemplate,
            Clock clock
    ) {
        this.relationshipRepository = relationshipRepository;
        this.userRepository = userRepository;
        this.blockRepository = blockRepository;
        this.userMapper = userMapper;
        this.mongoTemplate = mongoTemplate;
        this.clock = clock;
    }

    public boolean areFriends(String firstUserId, String secondUserId) {
        String[] pair = Ids.orderedPair(firstUserId, secondUserId);
        return relationshipRepository.existsByUserAIdAndUserBId(pair[0], pair[1]);
    }

    public void createFriendship(String firstUserId, String secondUserId) {
        String[] pair = Ids.orderedPair(firstUserId, secondUserId);
        if (relationshipRepository.existsByUserAIdAndUserBId(pair[0], pair[1])) {
            return;
        }
        RelationshipEntity relationship = new RelationshipEntity();
        relationship.setId(Ids.newId());
        relationship.setUserAId(pair[0]);
        relationship.setUserBId(pair[1]);
        relationship.setCreatedAt(clock.instant());
        try {
            relationshipRepository.save(relationship);
        } catch (DuplicateKeyException ignored) {
            // A concurrent accept already created the pair.
        }
    }

    public void removePair(String firstUserId, String secondUserId) {
        String[] pair = Ids.orderedPair(firstUserId, secondUserId);
        relationshipRepository.deleteByUserAIdAndUserBId(pair[0], pair[1]);
    }

    public void removeFriend(String userId, String otherUserId) {
        Ids.require(otherUserId);
        if (!areFriends(userId, otherUserId)) {
            throw new ResourceNotFoundException("Resource not found");
        }
        removePair(userId, otherUserId);
    }

    public PageResponse<UserSummaryResponse> listFriends(String userId, int page, int size) {
        Set<String> hidden = hiddenIds(userId);
        Pageable pageable = Paging.page(page, size, 50, Sort.by(Sort.Direction.DESC, "createdAt"));
        Criteria criteria = new Criteria().orOperator(
                Criteria.where("userAId").is(userId).and("userBId").nin(hidden),
                Criteria.where("userBId").is(userId).and("userAId").nin(hidden)
        );
        Query query = Query.query(criteria);
        long total = mongoTemplate.count(query, RelationshipEntity.class);
        query.with(pageable);
        List<RelationshipEntity> relationships = mongoTemplate.find(query, RelationshipEntity.class);
        List<String> friendIds = relationships.stream()
                .map(relationship -> relationship.getUserAId().equals(userId)
                        ? relationship.getUserBId()
                        : relationship.getUserAId())
                .toList();
        List<UserEntity> users = userRepository.findByIdIn(friendIds);
        List<UserSummaryResponse> summaries = new ArrayList<>();
        for (String friendId : friendIds) {
            users.stream().filter(user -> user.getId().equals(friendId)).findFirst()
                    .ifPresent(user -> summaries.add(userMapper.toSummary(user, RelationshipView.FRIENDS, userId)));
        }
        int totalPages = pageable.getPageSize() == 0 ? 0 : (int) Math.ceil((double) total / pageable.getPageSize());
        return new PageResponse<>(summaries, pageable.getPageNumber(), pageable.getPageSize(), total, totalPages,
                (long) (pageable.getPageNumber() + 1) * pageable.getPageSize() < total);
    }

    private Set<String> hiddenIds(String userId) {
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

    public Set<String> friendIdsAmong(String userId, Collection<String> otherIds) {
        Set<String> friends = new HashSet<>();
        relationshipRepository.findByUserAIdAndUserBIdIn(userId, otherIds)
                .forEach(relationship -> friends.add(relationship.getUserBId()));
        relationshipRepository.findByUserBIdAndUserAIdIn(userId, otherIds)
                .forEach(relationship -> friends.add(relationship.getUserAId()));
        return friends;
    }

    public void deleteAllForUser(String userId) {
        relationshipRepository.deleteAll(relationshipRepository.findByUserAIdOrUserBId(userId, userId));
    }
}
