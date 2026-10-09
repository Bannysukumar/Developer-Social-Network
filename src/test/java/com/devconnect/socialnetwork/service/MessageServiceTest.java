package com.devconnect.socialnetwork.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.devconnect.socialnetwork.domain.DeletionScope;
import com.devconnect.socialnetwork.dto.request.SendMessageRequest;
import com.devconnect.socialnetwork.entity.ConversationEntity;
import com.devconnect.socialnetwork.domain.MessageStatus;
import com.devconnect.socialnetwork.domain.MessageType;
import com.devconnect.socialnetwork.entity.MessageEntity;
import com.devconnect.socialnetwork.exception.ForbiddenException;
import com.devconnect.socialnetwork.mapper.MessageMapper;
import com.devconnect.socialnetwork.repository.MessageRepository;
import com.devconnect.socialnetwork.websocket.WebSocketSessionRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.LinkedHashSet;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MessageServiceTest {

    private static final String MESSAGE_ID = "507f1f77bcf86cd799439011";

    @Mock
    private MessageRepository messageRepository;
    @Mock
    private ConversationService conversationService;
    @Mock
    private FriendshipService friendshipService;
    @Mock
    private BlockService blockService;
    @Mock
    private AttachmentService attachmentService;
    @Mock
    private NotificationService notificationService;
    @Mock
    private WebSocketSessionRegistry sessionRegistry;

    private MessageService service;

    @BeforeEach
    void setUp() {
        service = new MessageService(
                messageRepository,
                conversationService,
                friendshipService,
                blockService,
                attachmentService,
                notificationService,
                new MessageMapper(),
                sessionRegistry,
                new ObjectMapper(),
                null,
                Clock.fixed(Instant.parse("2026-10-09T12:00:00Z"), ZoneOffset.UTC)
        );
    }

    @Test
    void senderClearsCiphertextForEveryoneAndARepeatDoesNotRestoreIt() {
        MessageEntity message = stored("cipher-text");
        when(messageRepository.findById(MESSAGE_ID)).thenReturn(Optional.of(message));

        var first = service.delete("ada", MESSAGE_ID, DeletionScope.everyone);
        var second = service.delete("ada", MESSAGE_ID, DeletionScope.everyone);

        assertThat(first.deletedForEveryone()).isTrue();
        assertThat(first.ciphertext()).isEmpty();
        assertThat(second.ciphertext()).isEmpty();
        assertThat(message.getCiphertext()).isEmpty();
        verify(messageRepository).save(message);
    }

    @Test
    void recipientCannotDeleteAnotherUsersMessageForEveryone() {
        when(messageRepository.findById(MESSAGE_ID)).thenReturn(Optional.of(stored("cipher-text")));

        assertThatThrownBy(() -> service.delete("bob", MESSAGE_ID, DeletionScope.everyone))
                .isInstanceOf(ForbiddenException.class);
        verify(messageRepository, never()).save(any());
    }

    @Test
    void deleteForMeHidesTheMessageOnlyForThatUser() {
        MessageEntity message = stored("cipher-text");
        when(messageRepository.findById(MESSAGE_ID)).thenReturn(Optional.of(message));

        service.delete("bob", MESSAGE_ID, DeletionScope.me);
        service.delete("bob", MESSAGE_ID, DeletionScope.me);

        assertThat(message.getDeletedForUserIds()).containsExactly("bob");
        assertThat(message.getCiphertext()).isEqualTo("cipher-text");
        assertThat(message.isDeletedForEveryone()).isFalse();
        verify(messageRepository).save(message);
    }

    @Test
    void senderCannotForgeAReadReceipt() {
        when(messageRepository.findById(MESSAGE_ID)).thenReturn(Optional.of(stored("cipher-text")));

        assertThatThrownBy(() -> service.markRead("ada", MESSAGE_ID))
                .isInstanceOf(ForbiddenException.class);
        verify(messageRepository, never()).save(any());
    }

    @Test
    void sendRejectsAnExistingConversationWhileABlockIsActive() {
        ConversationEntity conversation = new ConversationEntity();
        conversation.setParticipantIds(java.util.List.of("ada", "bob"));
        when(conversationService.requireMember("ada", "c1")).thenReturn(conversation);
        doThrow(new ForbiddenException("You can't interact with this account."))
                .when(blockService).assertCanInteract("ada", "bob");

        assertThatThrownBy(() -> service.send("ada", "c1", new SendMessageRequest("ciphertext", null, null, null, null, null)))
                .isInstanceOf(ForbiddenException.class);
        verify(messageRepository, never()).save(any());
        verify(notificationService, never()).notifyNewMessage(any(), any(), any());
    }

    private MessageEntity stored(String ciphertext) {
        MessageEntity message = new MessageEntity();
        message.setId(MESSAGE_ID);
        message.setConversationId("c1");
        message.setSenderId("ada");
        message.setRecipientId("bob");
        message.setCiphertext(ciphertext);
        message.setMessageType(MessageType.TEXT);
        message.setStatus(MessageStatus.SENT);
        message.setDeletedForUserIds(new LinkedHashSet<>());
        return message;
    }
}
