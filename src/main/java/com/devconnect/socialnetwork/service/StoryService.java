package com.devconnect.socialnetwork.service;

import com.devconnect.socialnetwork.domain.AccountStatus;
import com.devconnect.socialnetwork.domain.NotificationType;
import com.devconnect.socialnetwork.domain.RelationshipView;
import com.devconnect.socialnetwork.dto.response.StoryCardResponse;
import com.devconnect.socialnetwork.dto.response.StoryRingResponse;
import com.devconnect.socialnetwork.dto.response.StoryTrayResponse;
import com.devconnect.socialnetwork.dto.response.StoryViewerResponse;
import com.devconnect.socialnetwork.entity.StoryEntity;
import com.devconnect.socialnetwork.entity.StoryReactionEntity;
import com.devconnect.socialnetwork.entity.StoryViewEntity;
import com.devconnect.socialnetwork.entity.UserEntity;
import com.devconnect.socialnetwork.exception.ResourceNotFoundException;
import com.devconnect.socialnetwork.exception.ValidationFailedException;
import com.devconnect.socialnetwork.mapper.UserMapper;
import com.devconnect.socialnetwork.repository.StoryReactionRepository;
import com.devconnect.socialnetwork.repository.StoryRepository;
import com.devconnect.socialnetwork.repository.StoryViewRepository;
import com.devconnect.socialnetwork.repository.UserRepository;
import com.devconnect.socialnetwork.util.Ids;
import com.devconnect.socialnetwork.websocket.RealtimePublisher;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class StoryService {

    private static final Duration LIFE = Duration.ofHours(24);
    private static final Set<String> REACTIONS = Set.of("❤️", "❤", "😂", "😮", "😢", "🔥", "👍");

    private final StoryRepository storyRepository;
    private final StoryViewRepository viewRepository;
    private final StoryReactionRepository reactionRepository;
    private final UserRepository userRepository;
    private final FriendshipService friendshipService;
    private final BlockService blockService;
    private final NotificationService notificationService;
    private final FileStorageService fileStorageService;
    private final UserMapper userMapper;
    private final RealtimePublisher realtimePublisher;
    private final Clock clock;

    public StoryService(
            StoryRepository storyRepository,
            StoryViewRepository viewRepository,
            StoryReactionRepository reactionRepository,
            UserRepository userRepository,
            FriendshipService friendshipService,
            BlockService blockService,
            NotificationService notificationService,
            FileStorageService fileStorageService,
            UserMapper userMapper,
            RealtimePublisher realtimePublisher,
            Clock clock
    ) {
        this.storyRepository = storyRepository;
        this.viewRepository = viewRepository;
        this.reactionRepository = reactionRepository;
        this.userRepository = userRepository;
        this.friendshipService = friendshipService;
        this.blockService = blockService;
        this.notificationService = notificationService;
        this.fileStorageService = fileStorageService;
        this.userMapper = userMapper;
        this.realtimePublisher = realtimePublisher;
        this.clock = clock;
    }

    public StoryCardResponse publish(String ownerId, String clientStoryId, String caption, String textStyle, byte[] bytes) {
        Ids.require(ownerId);
        String requestId = StoryMediaInspector.clientStoryId(clientStoryId);
        StoryEntity existing = storyRepository.findByOwnerIdAndClientStoryId(ownerId, requestId).orElse(null);
        if (existing != null) {
            if (!active(existing)) {
                throw new ValidationFailedException("That story was already removed");
            }
            return card(existing, ownerId);
        }
        StoryMediaInspector.Inspected media = StoryMediaInspector.inspect(bytes);
        FileStorageService.StoredObject stored = fileStorageService.storeStory(bytes);
        Instant now = clock.instant();
        StoryEntity story = new StoryEntity();
        story.setId(Ids.newId());
        story.setOwnerId(ownerId);
        story.setClientStoryId(requestId);
        story.setStorageKey(stored.storageKey());
        story.setContentType(media.contentType());
        story.setMediaType(media.mediaType());
        story.setSize(stored.size());
        story.setCaption(StoryMediaInspector.caption(caption));
        story.setTextStyle(StoryMediaInspector.textStyle(textStyle));
        story.setCreatedAt(now);
        story.setExpiresAt(now.plus(LIFE));
        try {
            storyRepository.save(story);
        } catch (DuplicateKeyException ex) {
            fileStorageService.deleteKey(stored.storageKey());
            StoryEntity raced = storyRepository.findByOwnerIdAndClientStoryId(ownerId, requestId)
                    .orElseThrow(() -> new ValidationFailedException("The story could not be published"));
            return card(raced, ownerId);
        }
        publishToFriends(ownerId, "STORY_PUBLISHED", story.getId());
        return card(story, ownerId);
    }

    public StoryTrayResponse tray(String viewerId) {
        Ids.require(viewerId);
        purgeExpired();
        List<StoryEntity> mine = activeOwned(viewerId);
        List<String> friendIds = friendshipService.visibleFriendIds(viewerId, 40);
        List<StoryEntity> theirs = friendIds.isEmpty() ? List.of() : activeOwnedBy(friendIds);
        Map<String, List<StoryEntity>> grouped = new LinkedHashMap<>();
        for (StoryEntity story : theirs) {
            grouped.computeIfAbsent(story.getOwnerId(), ignored -> new ArrayList<>()).add(story);
        }
        List<String> storyIds = new ArrayList<>();
        theirs.forEach(story -> storyIds.add(story.getId()));
        Set<String> viewed = viewedIds(viewerId, storyIds);
        Map<String, String> reactions = reactionMap(viewerId, storyIds);
        List<StoryRingResponse> rings = new ArrayList<>();
        for (String friendId : friendIds) {
            List<StoryEntity> stories = grouped.get(friendId);
            if (stories == null || stories.isEmpty()) {
                continue;
            }
            UserEntity user = userRepository.findById(friendId).orElse(null);
            if (user == null || user.getStatus() != AccountStatus.ACTIVE) {
                continue;
            }
            List<StoryCardResponse> cards = stories.stream()
                    .map(story -> card(story, viewerId, viewed.contains(story.getId()), reactions.get(story.getId())))
                    .toList();
            boolean unseen = cards.stream().anyMatch(card -> !card.viewed());
            rings.add(new StoryRingResponse(userMapper.toSummary(user, RelationshipView.FRIENDS, viewerId), unseen, cards));
        }
        return new StoryTrayResponse(mine.stream().map(story -> card(story, viewerId)).toList(), rings);
    }

    public StoryCardResponse get(String viewerId, String storyId) {
        return card(requireVisible(viewerId, storyId), viewerId);
    }

    public OpenedMedia openMedia(String viewerId, String storyId) {
        StoryEntity story = requireVisible(viewerId, storyId);
        return new OpenedMedia(fileStorageService.openKey(story.getStorageKey()), story.getSize(), story.getContentType());
    }

    public StoryCardResponse recordView(String viewerId, String storyId) {
        StoryEntity story = requireVisible(viewerId, storyId);
        if (!viewerId.equals(story.getOwnerId()) && viewRepository.findByStoryIdAndViewerId(storyId, viewerId).isEmpty()) {
            StoryViewEntity view = new StoryViewEntity();
            view.setId(Ids.newId());
            view.setStoryId(storyId);
            view.setViewerId(viewerId);
            view.setViewedAt(clock.instant());
            try {
                viewRepository.save(view);
            } catch (DuplicateKeyException ignored) {
                // A repeated open keeps a single view.
            }
        }
        return card(story, viewerId);
    }

    public List<StoryViewerResponse> viewers(String ownerId, String storyId) {
        StoryEntity story = requireOwned(ownerId, storyId);
        if (!active(story)) {
            throw new ResourceNotFoundException("Resource not found");
        }
        List<StoryViewerResponse> people = new ArrayList<>();
        for (StoryViewEntity view : viewRepository.findByStoryId(storyId)) {
            if (people.size() >= 100) {
                break;
            }
            UserEntity user = userRepository.findById(view.getViewerId()).orElse(null);
            if (user == null || blockService.eitherBlocked(ownerId, user.getId())) {
                continue;
            }
            people.add(new StoryViewerResponse(
                    user.getId(),
                    user.getUsername(),
                    user.getDisplayName(),
                    view.getViewedAt().toString()
            ));
        }
        return people;
    }

    public StoryCardResponse react(String userId, String storyId, String emoji) {
        if (emoji == null || !REACTIONS.contains(emoji)) {
            throw new ValidationFailedException("That reaction is not supported");
        }
        StoryEntity story = requireVisible(userId, storyId);
        if (userId.equals(story.getOwnerId())) {
            throw new ValidationFailedException("You cannot react to your own story");
        }
        String stored = "❤".equals(emoji) ? "❤️" : emoji;
        StoryReactionEntity reaction = reactionRepository.findByStoryIdAndUserId(storyId, userId).orElse(null);
        boolean created = reaction == null;
        if (reaction == null) {
            reaction = new StoryReactionEntity();
            reaction.setId(Ids.newId());
            reaction.setStoryId(storyId);
            reaction.setUserId(userId);
            reaction.setCreatedAt(clock.instant());
        }
        reaction.setEmoji(stored);
        try {
            reactionRepository.save(reaction);
        } catch (DuplicateKeyException ex) {
            reaction = reactionRepository.findByStoryIdAndUserId(storyId, userId)
                    .orElseThrow(() -> new ValidationFailedException("The reaction could not be saved"));
            reaction.setEmoji(stored);
            reactionRepository.save(reaction);
            created = false;
        }
        if (created) {
            notificationService.notify(story.getOwnerId(), NotificationType.STORY_REACTION, userId, storyId, "reacted to your story");
        }
        return card(story, userId);
    }

    public StoryCardResponse clearReaction(String userId, String storyId) {
        StoryEntity story = requireVisible(userId, storyId);
        reactionRepository.deleteByStoryIdAndUserId(storyId, userId);
        return card(story, userId);
    }

    public void delete(String ownerId, String storyId) {
        StoryEntity story = requireOwned(ownerId, storyId);
        if (story.getDeletedAt() != null) {
            return;
        }
        story.setDeletedAt(clock.instant());
        storyRepository.save(story);
        releaseMedia(story.getStorageKey());
        viewRepository.deleteByStoryId(storyId);
        reactionRepository.deleteByStoryId(storyId);
        publishToFriends(ownerId, "STORY_DELETED", storyId);
    }

    public void deleteAllForOwner(String ownerId) {
        List<StoryEntity> stories = storyRepository.findByOwnerId(ownerId);
        List<String> ids = stories.stream().map(StoryEntity::getId).toList();
        for (StoryEntity story : stories) {
            releaseMedia(story.getStorageKey());
        }
        if (!ids.isEmpty()) {
            viewRepository.deleteByStoryIdIn(ids);
            reactionRepository.deleteByStoryIdIn(ids);
        }
        storyRepository.deleteAll(stories);
    }

    public record OpenedMedia(InputStream body, long size, String contentType) {
    }

    private void purgeExpired() {
        Instant cutoff = clock.instant().minus(Duration.ofHours(1));
        List<StoryEntity> expired = storyRepository.findTop40ByDeletedAtIsNullAndExpiresAtBefore(cutoff);
        for (StoryEntity story : expired) {
            story.setDeletedAt(clock.instant());
            storyRepository.save(story);
            releaseMedia(story.getStorageKey());
        }
    }

    private void releaseMedia(String storageKey) {
        if (storageKey == null) {
            return;
        }
        boolean stillUsed = storyRepository.findByStorageKey(storageKey).stream()
                .anyMatch(story -> story.getDeletedAt() == null);
        if (!stillUsed) {
            fileStorageService.deleteKey(storageKey);
        }
    }

    private List<StoryEntity> activeOwned(String ownerId) {
        return activeOwnedBy(List.of(ownerId));
    }

    private List<StoryEntity> activeOwnedBy(List<String> ownerIds) {
        return storyRepository.findActiveByOwnerIdIn(ownerIds, clock.instant()).stream()
                .sorted((left, right) -> left.getCreatedAt().compareTo(right.getCreatedAt()))
                .limit(20L * Math.max(ownerIds.size(), 1))
                .toList();
    }

    private boolean active(StoryEntity story) {
        return story.getDeletedAt() == null && story.getExpiresAt() != null && story.getExpiresAt().isAfter(clock.instant());
    }

    private StoryEntity requireVisible(String viewerId, String storyId) {
        Ids.require(viewerId);
        Ids.require(storyId);
        StoryEntity story = storyRepository.findById(storyId).orElseThrow(() -> new ResourceNotFoundException("Resource not found"));
        if (!active(story)) {
            throw new ResourceNotFoundException("Resource not found");
        }
        if (viewerId.equals(story.getOwnerId())) {
            return story;
        }
        if (blockService.eitherBlocked(viewerId, story.getOwnerId()) || !friendshipService.areFriends(viewerId, story.getOwnerId())) {
            throw new ResourceNotFoundException("Resource not found");
        }
        return story;
    }

    private StoryEntity requireOwned(String ownerId, String storyId) {
        Ids.require(ownerId);
        Ids.require(storyId);
        StoryEntity story = storyRepository.findById(storyId).orElseThrow(() -> new ResourceNotFoundException("Resource not found"));
        if (!ownerId.equals(story.getOwnerId())) {
            throw new ResourceNotFoundException("Resource not found");
        }
        return story;
    }

    private StoryCardResponse card(StoryEntity story, String viewerId) {
        boolean viewed = viewerId.equals(story.getOwnerId())
                || viewRepository.findByStoryIdAndViewerId(story.getId(), viewerId).isPresent();
        String reaction = reactionRepository.findByStoryIdAndUserId(story.getId(), viewerId).map(StoryReactionEntity::getEmoji).orElse(null);
        return card(story, viewerId, viewed, reaction);
    }

    private StoryCardResponse card(StoryEntity story, String viewerId, boolean viewed, String reaction) {
        boolean mine = viewerId.equals(story.getOwnerId());
        Long views = mine ? viewRepository.countByStoryId(story.getId()) : null;
        return new StoryCardResponse(
                story.getId(),
                story.getOwnerId(),
                story.getMediaType(),
                story.getContentType(),
                story.getCaption() == null ? "" : story.getCaption(),
                story.getTextStyle() == null ? "plain" : story.getTextStyle(),
                story.getCreatedAt().toString(),
                story.getExpiresAt().toString(),
                viewed,
                mine,
                views,
                reaction
        );
    }

    private Set<String> viewedIds(String viewerId, List<String> storyIds) {
        if (storyIds.isEmpty()) {
            return Set.of();
        }
        return viewRepository.findByViewerIdAndStoryIdIn(viewerId, storyIds).stream()
                .map(StoryViewEntity::getStoryId)
                .collect(java.util.stream.Collectors.toSet());
    }

    private Map<String, String> reactionMap(String userId, List<String> storyIds) {
        Map<String, String> reactions = new LinkedHashMap<>();
        if (storyIds.isEmpty()) {
            return reactions;
        }
        for (StoryReactionEntity reaction : reactionRepository.findByUserIdAndStoryIdIn(userId, storyIds)) {
            reactions.put(reaction.getStoryId(), reaction.getEmoji());
        }
        return reactions;
    }

    private void publishToFriends(String ownerId, String type, String storyId) {
        Map<String, String> data = Map.of("storyId", storyId, "ownerId", ownerId);
        realtimePublisher.publish(ownerId, type, data);
        for (String friendId : friendshipService.visibleFriendIds(ownerId, 100)) {
            realtimePublisher.publish(friendId, type, data);
        }
    }
}
