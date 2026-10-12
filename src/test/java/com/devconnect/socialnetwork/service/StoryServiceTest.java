package com.devconnect.socialnetwork.service;

import com.devconnect.socialnetwork.domain.NotificationType;
import com.devconnect.socialnetwork.entity.StoryEntity;
import com.devconnect.socialnetwork.entity.StoryViewEntity;
import com.devconnect.socialnetwork.exception.ResourceNotFoundException;
import com.devconnect.socialnetwork.exception.ValidationFailedException;
import com.devconnect.socialnetwork.mapper.UserMapper;
import com.devconnect.socialnetwork.repository.StoryReactionRepository;
import com.devconnect.socialnetwork.repository.StoryRepository;
import com.devconnect.socialnetwork.repository.StoryViewRepository;
import com.devconnect.socialnetwork.repository.UserRepository;
import com.devconnect.socialnetwork.websocket.RealtimePublisher;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class StoryServiceTest {

    private static final String ADA = "507f1f77bcf86cd799439011";
    private static final String BOB = "507f1f77bcf86cd799439012";
    private static final Instant NOW = Instant.parse("2026-10-12T12:00:00Z");

    @Mock private StoryRepository storyRepository;
    @Mock private StoryViewRepository viewRepository;
    @Mock private StoryReactionRepository reactionRepository;
    @Mock private UserRepository userRepository;
    @Mock private FriendshipService friendshipService;
    @Mock private BlockService blockService;
    @Mock private NotificationService notificationService;
    @Mock private FileStorageService fileStorageService;
    @Mock private UserMapper userMapper;
    @Mock private RealtimePublisher realtimePublisher;

    private StoryService service;

    @BeforeEach
    void setUp() {
        service = new StoryService(
                storyRepository, viewRepository, reactionRepository, userRepository, friendshipService,
                blockService, notificationService, fileStorageService, userMapper, realtimePublisher,
                Clock.fixed(NOW, ZoneOffset.UTC)
        );
    }

    @Test
    void publishingAJpegStoresOneStoryAndARepeatDoesNotStoreAgain() {
        byte[] jpeg = new byte[] {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xD9};
        when(reactionRepository.findByStoryIdAndUserId(any(), any())).thenReturn(Optional.empty());
        when(viewRepository.countByStoryId(any())).thenReturn(0L);
        when(storyRepository.findByOwnerIdAndClientStoryId(ADA, "client-01")).thenReturn(Optional.empty());
        when(fileStorageService.storeStory(jpeg)).thenReturn(new FileStorageService.StoredObject("stories/one", jpeg.length));
        when(storyRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(friendshipService.visibleFriendIds(ADA, 100)).thenReturn(List.of(BOB));

        var created = service.publish(ADA, "client-01", "hello", "plain", jpeg);
        assertThat(created.mine()).isTrue();
        assertThat(created.mediaType()).isEqualTo("IMAGE");
        assertThat(created.expiresAt()).isEqualTo(NOW.plusSeconds(24 * 3600).toString());
        verify(realtimePublisher).publish(eq(BOB), eq("STORY_PUBLISHED"), any());

        StoryEntity stored = new StoryEntity();
        stored.setId(created.id());
        stored.setOwnerId(ADA);
        stored.setClientStoryId("client-01");
        stored.setMediaType("IMAGE");
        stored.setContentType("image/jpeg");
        stored.setCaption("hello");
        stored.setTextStyle("plain");
        stored.setCreatedAt(NOW);
        stored.setExpiresAt(NOW.plusSeconds(24 * 3600));
        when(storyRepository.findByOwnerIdAndClientStoryId(ADA, "client-01")).thenReturn(Optional.of(stored));

        service.publish(ADA, "client-01", "hello", "plain", jpeg);
        verify(fileStorageService, times(1)).storeStory(any());
    }

    @Test
    void aSecondStoryIsStoredSeparatelyAndDoesNotReplaceTheFirst() {
        byte[] jpeg = new byte[] {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xD9};
        when(reactionRepository.findByStoryIdAndUserId(any(), any())).thenReturn(Optional.empty());
        when(viewRepository.countByStoryId(any())).thenReturn(0L);
        when(storyRepository.findByOwnerIdAndClientStoryId(eq(ADA), any())).thenReturn(Optional.empty());
        when(fileStorageService.storeStory(jpeg)).thenReturn(
                new FileStorageService.StoredObject("stories/one", jpeg.length),
                new FileStorageService.StoredObject("stories/two", jpeg.length)
        );
        when(storyRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(friendshipService.visibleFriendIds(ADA, 100)).thenReturn(List.of());

        var first = service.publish(ADA, "client-01", "one", "plain", jpeg);
        var second = service.publish(ADA, "client-02", "two", "dark", jpeg);

        assertThat(first.id()).isNotEqualTo(second.id());
        assertThat(first.caption()).isEqualTo("one");
        assertThat(second.caption()).isEqualTo("two");
        verify(storyRepository, times(2)).save(any());
        verify(fileStorageService, never()).deleteKey(any());
    }

    @Test
    void invalidMediaIsRejectedBeforeStorage() {
        assertThatThrownBy(() -> service.publish(ADA, "client-01", "", "plain", "notes".getBytes()))
                .isInstanceOf(ValidationFailedException.class);
        verify(fileStorageService, never()).storeStory(any());
    }

    @Test
    void aBlockedOrExpiredStoryCannotBeOpened() {
        StoryEntity story = activeStory();
        when(storyRepository.findById(story.getId())).thenReturn(Optional.of(story));
        when(blockService.eitherBlocked(BOB, ADA)).thenReturn(true);
        assertThatThrownBy(() -> service.get(BOB, story.getId())).isInstanceOf(ResourceNotFoundException.class);

        story.setExpiresAt(NOW.minusSeconds(1));
        assertThatThrownBy(() -> service.get(ADA, story.getId())).isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void viewsAreStoredOnceAndOnlyTheOwnerCanListViewers() {
        StoryEntity story = activeStory();
        when(storyRepository.findById(story.getId())).thenReturn(Optional.of(story));
        when(blockService.eitherBlocked(BOB, ADA)).thenReturn(false);
        when(friendshipService.areFriends(BOB, ADA)).thenReturn(true);
        when(viewRepository.findByStoryIdAndViewerId(story.getId(), BOB)).thenReturn(Optional.empty(), Optional.of(new StoryViewEntity()));
        when(reactionRepository.findByStoryIdAndUserId(story.getId(), BOB)).thenReturn(Optional.empty());

        service.recordView(BOB, story.getId());
        service.recordView(BOB, story.getId());
        verify(viewRepository, times(1)).save(any());

        assertThatThrownBy(() -> service.viewers(BOB, story.getId())).isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void anotherPersonCannotDeleteAStoryAndDeletionReleasesUnsharedMedia() {
        StoryEntity story = activeStory();
        when(storyRepository.findById(story.getId())).thenReturn(Optional.of(story));
        assertThatThrownBy(() -> service.delete(BOB, story.getId())).isInstanceOf(ResourceNotFoundException.class);
        verify(storyRepository, never()).save(any());

        when(storyRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(storyRepository.findByStorageKey("stories/one")).thenReturn(List.of());
        when(friendshipService.visibleFriendIds(ADA, 100)).thenReturn(List.of());
        service.delete(ADA, story.getId());
        verify(fileStorageService).deleteKey("stories/one");
        verify(realtimePublisher).publish(eq(ADA), eq("STORY_DELETED"), any());
    }

    @Test
    void aReactionNotifiesTheOwnerOnce() {
        StoryEntity story = activeStory();
        when(storyRepository.findById(story.getId())).thenReturn(Optional.of(story));
        when(blockService.eitherBlocked(BOB, ADA)).thenReturn(false);
        when(friendshipService.areFriends(BOB, ADA)).thenReturn(true);
        when(reactionRepository.findByStoryIdAndUserId(story.getId(), BOB)).thenReturn(Optional.empty());
        when(reactionRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(viewRepository.findByStoryIdAndViewerId(story.getId(), BOB)).thenReturn(Optional.empty());

        service.react(BOB, story.getId(), "🔥");
        verify(notificationService).notify(ADA, NotificationType.STORY_REACTION, BOB, story.getId(), "reacted to your story");
    }

    private static StoryEntity activeStory() {
        StoryEntity story = new StoryEntity();
        story.setId("507f1f77bcf86cd799439099");
        story.setOwnerId(ADA);
        story.setStorageKey("stories/one");
        story.setMediaType("IMAGE");
        story.setContentType("image/jpeg");
        story.setCaption("hello");
        story.setTextStyle("plain");
        story.setCreatedAt(NOW);
        story.setExpiresAt(NOW.plusSeconds(3600));
        return story;
    }
}
