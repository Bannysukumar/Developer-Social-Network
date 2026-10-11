package com.devconnect.socialnetwork.service;

import com.devconnect.socialnetwork.dto.response.ReactionMark;
import com.devconnect.socialnetwork.entity.MessageEntity;
import com.devconnect.socialnetwork.entity.MessageReactionEntity;
import com.devconnect.socialnetwork.exception.ForbiddenException;
import com.devconnect.socialnetwork.exception.ValidationFailedException;
import com.devconnect.socialnetwork.repository.MessageReactionRepository;
import com.devconnect.socialnetwork.repository.MessageRepository;
import com.devconnect.socialnetwork.websocket.RealtimePublisher;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
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
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ReactionServiceTest {

    @Mock
    private MessageRepository messageRepository;
    @Mock
    private MessageReactionRepository reactionRepository;
    @Mock
    private ConversationService conversationService;
    @Mock
    private RealtimePublisher realtimePublisher;

    private ReactionService service;

    @BeforeEach
    void setUp() {
        service = new ReactionService(
                messageRepository,
                reactionRepository,
                conversationService,
                realtimePublisher,
                Clock.fixed(Instant.parse("2026-10-12T00:00:00Z"), ZoneOffset.UTC)
        );
    }

    @Test
    void aSecondEmojiReplacesTheSameUsersReaction() {
        when(messageRepository.findById("m1")).thenReturn(Optional.of(message()));
        MessageReactionEntity existing = new MessageReactionEntity();
        existing.setUserId("ada");
        existing.setEmoji("👍");
        when(reactionRepository.findByMessageIdAndUserId("m1", "ada")).thenReturn(Optional.of(existing));
        when(reactionRepository.findByMessageId("m1")).thenReturn(List.of(existing));

        var snapshot = service.set("ada", "c1", "m1", "❤️");

        assertThat(existing.getEmoji()).isEqualTo("❤️");
        assertThat(snapshot.items()).containsExactly(new ReactionMark("ada", "❤️"));
        verify(realtimePublisher).publish("ada", "REACTION", snapshot);
        verify(realtimePublisher).publish("grace", "REACTION", snapshot);
        verify(reactionRepository, never()).deleteByMessageIdAndUserId(any(), any());
    }

    @Test
    void unknownEmojiAndADeletedMessageAreRejected() {
        assertThatThrownBy(() -> service.set("ada", "c1", "m1", "💀")).isInstanceOf(ValidationFailedException.class);
        MessageEntity deleted = message();
        deleted.setDeletedForEveryone(true);
        when(messageRepository.findById("m1")).thenReturn(Optional.of(deleted));
        assertThatThrownBy(() -> service.set("ada", "c1", "m1", "👍")).isInstanceOf(ForbiddenException.class);
    }

    @Test
    void clearingRemovesOnlyTheCallerReaction() {
        when(messageRepository.findById("m1")).thenReturn(Optional.of(message()));
        when(reactionRepository.findByMessageId("m1")).thenReturn(List.of());

        service.clear("ada", "c1", "m1");

        ArgumentCaptor<String> user = ArgumentCaptor.forClass(String.class);
        verify(reactionRepository).deleteByMessageIdAndUserId(org.mockito.ArgumentMatchers.eq("m1"), user.capture());
        assertThat(user.getValue()).isEqualTo("ada");
    }

    private static MessageEntity message() {
        MessageEntity message = new MessageEntity();
        message.setId("m1");
        message.setConversationId("c1");
        message.setSenderId("ada");
        message.setRecipientId("grace");
        return message;
    }
}
