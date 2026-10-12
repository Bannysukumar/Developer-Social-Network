package com.devconnect.socialnetwork.service;

import com.devconnect.socialnetwork.domain.ConversationType;
import com.devconnect.socialnetwork.entity.ConversationEntity;
import com.devconnect.socialnetwork.entity.MessageEntity;
import com.devconnect.socialnetwork.exception.ResourceNotFoundException;
import com.devconnect.socialnetwork.repository.ConversationRepository;
import com.devconnect.socialnetwork.repository.UserRepository;
import com.devconnect.socialnetwork.websocket.RealtimePublisher;
import com.mongodb.client.result.UpdateResult;
import org.bson.BsonObjectId;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;

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
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ConversationServiceTest {

    @Mock
    private ConversationRepository repository;
    @Mock
    private UserRepository userRepository;
    @Mock
    private FriendshipService friendshipService;
    @Mock
    private BlockService blockService;
    @Mock
    private MongoTemplate mongoTemplate;
    @Mock
    private RealtimePublisher realtimePublisher;

    private ConversationService service;

    @BeforeEach
    void setUp() {
        service = new ConversationService(
                repository,
                userRepository,
                friendshipService,
                blockService,
                mongoTemplate,
                Clock.fixed(Instant.parse("2026-10-09T12:00:00Z"), ZoneOffset.UTC),
                realtimePublisher
        );
    }

    @Test
    void listKeepsAnExistingConversationWhenEitherPersonIsBlocked() {
        when(mongoTemplate.count(any(Query.class), eq(ConversationEntity.class))).thenReturn(1L);
        ConversationEntity conversation = new ConversationEntity();
        conversation.setId("507f1f77bcf86cd799439011");
        conversation.setType(ConversationType.ONE_TO_ONE);
        conversation.setParticipantIds(List.of("507f1f77bcf86cd799439012", "507f1f77bcf86cd799439013"));
        conversation.setCreatedAt(Instant.parse("2026-10-09T12:00:00Z"));
        conversation.setUpdatedAt(Instant.parse("2026-10-09T12:00:00Z"));
        when(mongoTemplate.find(any(Query.class), eq(ConversationEntity.class))).thenReturn(List.of(conversation));

        var page = service.list("507f1f77bcf86cd799439012", 0, 20);

        ArgumentCaptor<Query> query = ArgumentCaptor.forClass(Query.class);
        verify(mongoTemplate).count(query.capture(), eq(ConversationEntity.class));
        assertThat(query.getValue().getQueryObject().toJson()).doesNotContain("nin");
        assertThat(page.items()).hasSize(1);
        assertThat(page.totalElements()).isEqualTo(1);
        verify(blockService, never()).hiddenUserIds(any());
        verify(repository, never()).save(any());
    }

    @Test
    void clearHistoryStoresOnlyTheCallerBoundary() {
        ConversationEntity conversation = conversation();
        conversation.getHistoryClearedAt().put("user-b", Instant.parse("2026-10-01T00:00:00Z"));
        when(repository.findById(conversation.getId())).thenReturn(Optional.of(conversation));
        when(mongoTemplate.find(any(Query.class), eq(ConversationEntity.class))).thenReturn(List.of(conversation));
        when(mongoTemplate.updateMulti(any(Query.class), any(Update.class), eq(MessageEntity.class)))
                .thenReturn(UpdateResult.acknowledged(1, 1L, new BsonObjectId()));

        var result = service.clearHistory("user-a", conversation.getId());

        assertThat(result.clearedAt()).isEqualTo(Instant.parse("2026-10-09T12:00:00Z"));
        assertThat(conversation.getHistoryClearedAt().get("user-a")).isEqualTo(result.clearedAt());
        assertThat(conversation.getHistoryClearedAt().get("user-b")).isEqualTo(Instant.parse("2026-10-01T00:00:00Z"));
        assertThat(conversation.getUpdatedAt()).isEqualTo(Instant.parse("2026-10-09T12:00:00Z"));
        verify(repository).save(conversation);
        verify(realtimePublisher).publish(eq("user-a"), eq("HISTORY_CLEARED"), any());
        verify(realtimePublisher, never()).publish(eq("user-b"), any(), any());
    }

    @Test
    void clearHistoryAgainMovesOnlyTheCallerBoundary() {
        ConversationEntity conversation = conversation();
        when(repository.findById(conversation.getId())).thenReturn(Optional.of(conversation));
        when(mongoTemplate.find(any(Query.class), eq(ConversationEntity.class))).thenReturn(List.of(conversation));
        when(mongoTemplate.updateMulti(any(Query.class), any(Update.class), eq(MessageEntity.class)))
                .thenReturn(UpdateResult.acknowledged(0, 0L, new BsonObjectId()));

        service.clearHistory("user-a", conversation.getId());
        service.clearHistory("user-a", conversation.getId());

        assertThat(conversation.getHistoryClearedAt()).containsOnlyKeys("user-a");
    }

    @Test
    void aNonParticipantCannotClearHistory() {
        ConversationEntity conversation = conversation();
        when(repository.findById(conversation.getId())).thenReturn(Optional.of(conversation));

        assertThatThrownBy(() -> service.clearHistory("user-c", conversation.getId()))
                .isInstanceOf(ResourceNotFoundException.class);
        verify(repository, never()).save(any());
        verify(mongoTemplate, never()).updateMulti(any(Query.class), any(Update.class), eq(MessageEntity.class));
    }

    private static ConversationEntity conversation() {
        ConversationEntity conversation = new ConversationEntity();
        conversation.setId("507f1f77bcf86cd799439011");
        conversation.setType(ConversationType.ONE_TO_ONE);
        conversation.setParticipantIds(List.of("user-a", "user-b"));
        conversation.setCreatedAt(Instant.parse("2026-10-09T12:00:00Z"));
        conversation.setUpdatedAt(Instant.parse("2026-10-09T12:00:00Z"));
        return conversation;
    }
}
