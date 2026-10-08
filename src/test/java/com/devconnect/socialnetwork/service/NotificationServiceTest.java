package com.devconnect.socialnetwork.service;

import com.devconnect.socialnetwork.domain.NotificationType;
import com.devconnect.socialnetwork.entity.NotificationEntity;
import com.devconnect.socialnetwork.exception.ResourceNotFoundException;
import com.devconnect.socialnetwork.repository.NotificationRepository;
import com.devconnect.socialnetwork.websocket.RealtimePublisher;
import com.mongodb.client.result.UpdateResult;
import org.bson.BsonObjectId;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
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
class NotificationServiceTest {

    @Mock
    private NotificationRepository repository;
    @Mock
    private MongoTemplate mongoTemplate;
    @Mock
    private RealtimePublisher realtimePublisher;

    private NotificationService service;

    @BeforeEach
    void setUp() {
        service = new NotificationService(repository, mongoTemplate, Clock.fixed(Instant.parse("2026-10-08T18:00:00Z"), ZoneOffset.UTC), realtimePublisher);
    }

    @Test
    void markReadPersistsOnlyTheOwnersNotification() {
        NotificationEntity entity = unread(NOTE_ID, "user-a");
        when(repository.findById(NOTE_ID)).thenReturn(Optional.of(entity));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        var response = service.markRead("user-a", NOTE_ID);

        assertThat(response.read()).isTrue();
        assertThat(response.id()).isEqualTo(NOTE_ID);
        ArgumentCaptor<NotificationEntity> saved = ArgumentCaptor.forClass(NotificationEntity.class);
        verify(repository).save(saved.capture());
        assertThat(saved.getValue().isRead()).isTrue();
        assertThat(saved.getValue().getRecipientId()).isEqualTo("user-a");
    }

    @Test
    void anotherUserCannotMarkTheNotificationRead() {
        when(repository.findById(NOTE_ID)).thenReturn(Optional.of(unread(NOTE_ID, "user-a")));

        assertThatThrownBy(() -> service.markRead("user-b", NOTE_ID))
                .isInstanceOf(ResourceNotFoundException.class);
        verify(repository, never()).save(any());
    }

    @Test
    void anAlreadyReadNotificationStaysRead() {
        NotificationEntity entity = unread(NOTE_ID, "user-a");
        entity.setRead(true);
        when(repository.findById(NOTE_ID)).thenReturn(Optional.of(entity));

        var response = service.markRead("user-a", NOTE_ID);

        assertThat(response.read()).isTrue();
        verify(repository, never()).save(any());
    }

    @Test
    void listUsesTheStoredUnreadCount() {
        NotificationEntity entity = unread(NOTE_ID, "user-a");
        when(repository.findByRecipientId(eq("user-a"), any())).thenReturn(new PageImpl<>(List.of(entity)));
        when(repository.countByRecipientIdAndReadFalse("user-a")).thenReturn(3L);

        var list = service.list("user-a", 0, 20);

        assertThat(list.unreadCount()).isEqualTo(3);
        assertThat(list.page().items()).hasSize(1);
        assertThat(list.page().items().get(0).read()).isFalse();
    }

    @Test
    void markAllReadUpdatesEveryUnreadNotificationForThatUser() {
        when(mongoTemplate.updateMulti(any(Query.class), any(Update.class), eq(NotificationEntity.class)))
                .thenReturn(UpdateResult.acknowledged(4, 4L, new BsonObjectId()));

        var result = service.markAllRead("user-a");

        assertThat(result.updated()).isEqualTo(4);
        verify(mongoTemplate).updateMulti(any(Query.class), any(Update.class), eq(NotificationEntity.class));
    }

    private static final String NOTE_ID = "507f1f77bcf86cd799439011";

    private static NotificationEntity unread(String id, String recipientId) {
        NotificationEntity entity = new NotificationEntity();
        entity.setId(id);
        entity.setRecipientId(recipientId);
        entity.setType(NotificationType.NEW_MESSAGE);
        entity.setReferenceId("conversation-1");
        entity.setMessage("You received a new encrypted message");
        entity.setRead(false);
        entity.setCreatedAt(Instant.parse("2026-10-08T17:00:00Z"));
        return entity;
    }
}
