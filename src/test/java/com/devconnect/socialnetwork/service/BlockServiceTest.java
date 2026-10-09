package com.devconnect.socialnetwork.service;

import com.devconnect.socialnetwork.domain.AccountStatus;
import com.devconnect.socialnetwork.entity.ConversationEntity;
import com.devconnect.socialnetwork.entity.UserEntity;
import com.devconnect.socialnetwork.repository.BlockRepository;
import com.devconnect.socialnetwork.repository.ConversationRepository;
import com.devconnect.socialnetwork.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.mongodb.core.MongoTemplate;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class BlockServiceTest {

    private static final String ADA = "507f1f77bcf86cd799439011";
    private static final String BOB = "507f1f77bcf86cd799439012";

    @Mock
    private BlockRepository blockRepository;
    @Mock
    private ConversationRepository conversationRepository;
    @Mock
    private UserRepository userRepository;
    @Mock
    private FriendshipService friendshipService;
    @Mock
    private AuditService auditService;
    @Mock
    private MongoTemplate mongoTemplate;

    private BlockService service;

    @BeforeEach
    void setUp() {
        service = new BlockService(
                blockRepository,
                conversationRepository,
                userRepository,
                friendshipService,
                auditService,
                mongoTemplate,
                Clock.fixed(Instant.parse("2026-10-09T12:00:00Z"), ZoneOffset.UTC)
        );
    }

    @Test
    void blockingDoesNotDeleteTheFriendship() {
        when(userRepository.findById(BOB)).thenReturn(Optional.of(active(BOB)));
        when(blockRepository.existsByBlockerIdAndBlockedId(ADA, BOB)).thenReturn(false);

        service.block(ADA, BOB);

        verify(friendshipService, never()).removePair(any(), any());
        verify(blockRepository).save(any());
    }

    @Test
    void unblockingRestoresFriendshipWhenAConversationAlreadyExists() {
        when(userRepository.findById(BOB)).thenReturn(Optional.of(active(BOB)));
        when(blockRepository.findByBlockerIdAndBlockedId(ADA, BOB)).thenReturn(Optional.of(new com.devconnect.socialnetwork.entity.BlockEntity()));
        when(conversationRepository.findByParticipantKey(ADA + ":" + BOB)).thenReturn(Optional.of(new ConversationEntity()));

        service.unblock(ADA, BOB);

        verify(blockRepository).deleteByBlockerIdAndBlockedId(ADA, BOB);
        verify(friendshipService).createFriendship(ADA, BOB);
    }

    private UserEntity active(String id) {
        UserEntity user = new UserEntity();
        user.setId(id);
        user.setStatus(AccountStatus.ACTIVE);
        return user;
    }
}
