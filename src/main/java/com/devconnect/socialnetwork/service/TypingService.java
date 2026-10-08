package com.devconnect.socialnetwork.service;

import com.devconnect.socialnetwork.entity.ConversationEntity;
import com.devconnect.socialnetwork.websocket.RealtimePublisher;
import org.springframework.stereotype.Service;

import java.util.Map;

/** Typing is transient. It is not stored and it is not delivered across a block. */
@Service
public class TypingService {

    private final ConversationService conversationService;
    private final BlockService blockService;
    private final FriendshipService friendshipService;
    private final RealtimePublisher publisher;

    public TypingService(
            ConversationService conversationService,
            BlockService blockService,
            FriendshipService friendshipService,
            RealtimePublisher publisher
    ) {
        this.conversationService = conversationService;
        this.blockService = blockService;
        this.friendshipService = friendshipService;
        this.publisher = publisher;
    }

    public void publish(String userId, String conversationId, boolean active) {
        ConversationEntity conversation = conversationService.requireMember(userId, conversationId);
        String otherId = conversation.getParticipantIds().stream().filter(id -> !id.equals(userId)).findFirst().orElse(null);
        if (otherId == null || blockService.eitherBlocked(userId, otherId) || !friendshipService.areFriends(userId, otherId)) {
            return;
        }
        publisher.publish(otherId, active ? "TYPING_START" : "TYPING_STOP", Map.of(
                "conversationId", conversationId,
                "userId", userId
        ));
    }
}
