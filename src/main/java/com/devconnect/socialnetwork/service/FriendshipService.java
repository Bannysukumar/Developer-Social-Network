package com.devconnect.socialnetwork.service;

import com.devconnect.socialnetwork.domain.RelationshipView;
import com.devconnect.socialnetwork.dto.PageResponse;
import com.devconnect.socialnetwork.dto.response.UserSummaryResponse;
import com.devconnect.socialnetwork.entity.RelationshipEntity;
import com.devconnect.socialnetwork.entity.UserEntity;
import com.devconnect.socialnetwork.exception.ResourceNotFoundException;
import com.devconnect.socialnetwork.mapper.UserMapper;
import com.devconnect.socialnetwork.repository.RelationshipRepository;
import com.devconnect.socialnetwork.repository.UserRepository;
import com.devconnect.socialnetwork.util.Ids;
import com.devconnect.socialnetwork.util.Paging;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Sort;
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
    private final UserMapper userMapper;
    private final Clock clock;

    public FriendshipService(
            RelationshipRepository relationshipRepository,
            UserRepository userRepository,
            UserMapper userMapper,
            Clock clock
    ) {
        this.relationshipRepository = relationshipRepository;
        this.userRepository = userRepository;
        this.userMapper = userMapper;
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
        Page<RelationshipEntity> relationships = relationshipRepository.findByUserAIdOrUserBId(
                userId, userId, Paging.page(page, size, 50, Sort.by(Sort.Direction.DESC, "createdAt")));
        List<String> friendIds = relationships.getContent().stream()
                .map(relationship -> relationship.getUserAId().equals(userId)
                        ? relationship.getUserBId()
                        : relationship.getUserAId())
                .toList();
        List<UserEntity> users = userRepository.findByIdIn(friendIds);
        List<UserSummaryResponse> summaries = new ArrayList<>();
        for (String friendId : friendIds) {
            users.stream().filter(user -> user.getId().equals(friendId)).findFirst()
                    .ifPresent(user -> summaries.add(userMapper.toSummary(user, RelationshipView.FRIENDS)));
        }
        return Paging.map(relationships, summaries);
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
