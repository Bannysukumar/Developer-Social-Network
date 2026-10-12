package com.devconnect.socialnetwork.service;

import com.devconnect.socialnetwork.dto.CursorPageResponse;
import com.devconnect.socialnetwork.dto.response.MessageResponse;
import com.devconnect.socialnetwork.dto.response.ReactionMark;
import com.devconnect.socialnetwork.dto.response.ReactionSnapshot;
import com.devconnect.socialnetwork.entity.MessageEntity;
import com.devconnect.socialnetwork.entity.MessageReactionEntity;
import com.devconnect.socialnetwork.exception.ForbiddenException;
import com.devconnect.socialnetwork.exception.ResourceNotFoundException;
import com.devconnect.socialnetwork.exception.ValidationFailedException;
import com.devconnect.socialnetwork.repository.MessageReactionRepository;
import com.devconnect.socialnetwork.repository.MessageRepository;
import com.devconnect.socialnetwork.util.Ids;
import com.devconnect.socialnetwork.websocket.RealtimePublisher;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class ReactionService {

    static final Set<String> ALLOWED = Set.of(
            "😀", "😁", "😂", "🤣", "😊", "😍", "😘", "😎", "🤔", "😮", "😢", "😭", "😡", "😴", "🤯", "🙏",
            "👍", "👎", "👏", "🙌", "🤝", "👋", "✌️", "🤞",
            "🐶", "🐱", "🐻", "🐼", "🦊", "🐸", "🐵", "🦄",
            "🍎", "🍕", "🍔", "☕", "🍩", "🍪", "🥗", "🍜",
            "⚽", "🏀", "🎮", "🎯", "🎵", "🎸", "🏆", "🎨",
            "🚗", "✈️", "🚀", "🚲", "⛵", "🏠", "🗺️", "⛰️",
            "💻", "⌨️", "📱", "💡", "📌", "📚", "🔧", "📦",
            "❤️", "🔥", "✨", "💯", "✅", "⭐", "🎉", "👀"
    );

    private final MessageRepository messageRepository;
    private final MessageReactionRepository reactionRepository;
    private final ConversationService conversationService;
    private final RealtimePublisher realtimePublisher;
    private final Clock clock;

    public ReactionService(
            MessageRepository messageRepository,
            MessageReactionRepository reactionRepository,
            ConversationService conversationService,
            RealtimePublisher realtimePublisher,
            Clock clock
    ) {
        this.messageRepository = messageRepository;
        this.reactionRepository = reactionRepository;
        this.conversationService = conversationService;
        this.realtimePublisher = realtimePublisher;
        this.clock = clock;
    }

    public ReactionSnapshot set(String userId, String conversationId, String messageId, String emoji) {
        if (emoji == null || !ALLOWED.contains(emoji)) {
            throw new ValidationFailedException("Choose one of the available reactions.");
        }
        MessageEntity message = visibleMessage(userId, conversationId, messageId);
        MessageReactionEntity existing = reactionRepository.findByMessageIdAndUserId(message.getId(), userId).orElse(null);
        if (existing == null) {
            MessageReactionEntity created = new MessageReactionEntity();
            created.setMessageId(message.getId());
            created.setConversationId(message.getConversationId());
            created.setUserId(userId);
            created.setEmoji(emoji);
            created.setUpdatedAt(clock.instant());
            try {
                reactionRepository.save(created);
            } catch (DuplicateKeyException ex) {
                existing = reactionRepository.findByMessageIdAndUserId(message.getId(), userId)
                        .orElseThrow(() -> new ValidationFailedException("Reaction could not be saved."));
            }
        }
        if (existing != null) {
            existing.setEmoji(emoji);
            existing.setUpdatedAt(clock.instant());
            reactionRepository.save(existing);
        }
        return publish(message);
    }

    public ReactionSnapshot clear(String userId, String conversationId, String messageId) {
        MessageEntity message = visibleMessage(userId, conversationId, messageId);
        reactionRepository.deleteByMessageIdAndUserId(message.getId(), userId);
        return publish(message);
    }

    public CursorPageResponse<MessageResponse> withReactions(CursorPageResponse<MessageResponse> page) {
        if (page == null || page.items() == null || page.items().isEmpty()) {
            return page;
        }
        List<String> ids = page.items().stream().map(MessageResponse::id).toList();
        Map<String, List<ReactionMark>> grouped = grouped(reactionRepository.findByMessageIdIn(ids));
        List<MessageResponse> items = new ArrayList<>();
        for (MessageResponse message : page.items()) {
            items.add(copy(message, grouped.getOrDefault(message.id(), List.of())));
        }
        return new CursorPageResponse<>(items, page.nextCursor(), page.hasNext());
    }

    private ReactionSnapshot publish(MessageEntity message) {
        List<ReactionMark> items = reactionRepository.findByMessageId(message.getId()).stream()
                .map(row -> new ReactionMark(row.getUserId(), row.getEmoji()))
                .toList();
        ReactionSnapshot snapshot = new ReactionSnapshot(message.getId(), message.getConversationId(), items);
        realtimePublisher.publish(message.getSenderId(), "REACTION", snapshot);
        if (!message.getSenderId().equals(message.getRecipientId())) {
            realtimePublisher.publish(message.getRecipientId(), "REACTION", snapshot);
        }
        return snapshot;
    }

    private MessageEntity visibleMessage(String userId, String conversationId, String messageId) {
        Ids.require(messageId);
        Ids.require(conversationId);
        conversationService.requireMember(userId, conversationId);
        MessageEntity message = messageRepository.findById(messageId)
                .orElseThrow(() -> new ResourceNotFoundException("Resource not found"));
        if (!conversationId.equals(message.getConversationId())
                || (!message.getSenderId().equals(userId) && !message.getRecipientId().equals(userId))) {
            throw new ResourceNotFoundException("Resource not found");
        }
        if (message.isDeletedForEveryone()
                || (message.getDeletedForUserIds() != null && message.getDeletedForUserIds().contains(userId))
                || conversationService.hiddenByHistoryClear(userId, conversationId, message.getCreatedAt())) {
            throw new ForbiddenException("This message is no longer available.");
        }
        return message;
    }

    private static Map<String, List<ReactionMark>> grouped(List<MessageReactionEntity> rows) {
        Map<String, List<ReactionMark>> grouped = new LinkedHashMap<>();
        for (MessageReactionEntity row : rows) {
            grouped.computeIfAbsent(row.getMessageId(), key -> new ArrayList<>())
                    .add(new ReactionMark(row.getUserId(), row.getEmoji()));
        }
        return grouped;
    }

    private static MessageResponse copy(MessageResponse message, List<ReactionMark> reactions) {
        return new MessageResponse(
                message.id(),
                message.conversationId(),
                message.senderId(),
                message.recipientId(),
                message.ciphertext(),
                message.messageType(),
                message.status(),
                message.deviceId(),
                message.keyId(),
                message.createdAt(),
                message.deliveredAt(),
                message.readAt(),
                message.deletedForEveryone(),
                message.attachmentIds(),
                reactions
        );
    }
}
