package com.devconnect.socialnetwork.service;

import com.devconnect.socialnetwork.domain.ConversationType;
import com.devconnect.socialnetwork.entity.ConversationEntity;
import com.devconnect.socialnetwork.repository.ConversationRepository;
import com.devconnect.socialnetwork.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Query;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
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

    private ConversationService service;

    @BeforeEach
    void setUp() {
        service = new ConversationService(
                repository,
                userRepository,
                friendshipService,
                blockService,
                mongoTemplate,
                Clock.fixed(Instant.parse("2026-10-09T12:00:00Z"), ZoneOffset.UTC)
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
}
