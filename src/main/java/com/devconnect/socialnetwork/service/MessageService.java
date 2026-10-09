package com.devconnect.socialnetwork.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.devconnect.socialnetwork.crypto.CiphertextValidator;
import com.devconnect.socialnetwork.domain.DeletionScope;
import com.devconnect.socialnetwork.domain.MessageStatus;
import com.devconnect.socialnetwork.domain.MessageType;
import com.devconnect.socialnetwork.dto.CursorPageResponse;
import com.devconnect.socialnetwork.dto.WriteResult;
import com.devconnect.socialnetwork.dto.request.SendMessageRequest;
import com.devconnect.socialnetwork.dto.response.MessageAck;
import com.devconnect.socialnetwork.dto.response.MessageResponse;
import com.devconnect.socialnetwork.entity.ConversationEntity;
import com.devconnect.socialnetwork.entity.MessageEntity;
import com.devconnect.socialnetwork.exception.ForbiddenException;
import com.devconnect.socialnetwork.exception.ResourceNotFoundException;
import com.devconnect.socialnetwork.exception.ValidationFailedException;
import com.devconnect.socialnetwork.mapper.MessageMapper;
import com.devconnect.socialnetwork.repository.MessageRepository;
import com.devconnect.socialnetwork.util.CursorCodec;
import com.devconnect.socialnetwork.util.Ids;
import com.devconnect.socialnetwork.websocket.WebSocketSessionRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class MessageService {

    private static final Logger log = LoggerFactory.getLogger(MessageService.class);

    private final MessageRepository messageRepository;
    private final ConversationService conversationService;
    private final FriendshipService friendshipService;
    private final BlockService blockService;
    private final NotificationService notificationService;
    private final MessageMapper messageMapper;
    private final WebSocketSessionRegistry sessionRegistry;
    private final ObjectMapper objectMapper;
    private final MongoTemplate mongoTemplate;
    private final Clock clock;

    public MessageService(
            MessageRepository messageRepository,
            ConversationService conversationService,
            FriendshipService friendshipService,
            BlockService blockService,
            NotificationService notificationService,
            MessageMapper messageMapper,
            WebSocketSessionRegistry sessionRegistry,
            ObjectMapper objectMapper,
            MongoTemplate mongoTemplate,
            Clock clock
    ) {
        this.messageRepository = messageRepository;
        this.conversationService = conversationService;
        this.friendshipService = friendshipService;
        this.blockService = blockService;
        this.notificationService = notificationService;
        this.messageMapper = messageMapper;
        this.sessionRegistry = sessionRegistry;
        this.objectMapper = objectMapper;
        this.mongoTemplate = mongoTemplate;
        this.clock = clock;
    }

    public WriteResult<MessageResponse> send(String senderId, String conversationId, SendMessageRequest request) {
        ConversationEntity conversation = conversationService.requireMember(senderId, conversationId);
        String recipientId = conversation.otherParticipant(senderId);
        assertCanMessage(senderId, recipientId);
        MessageType type = request.messageType() == null ? MessageType.TEXT : request.messageType();
        if (type == MessageType.SYSTEM) {
            throw new ValidationFailedException("System messages cannot be created by clients");
        }
        String ciphertext = CiphertextValidator.require(request.ciphertext());
        String clientMessageId = blankToNull(request.clientMessageId());
        if (clientMessageId != null) {
            var existing = messageRepository.findByConversationIdAndSenderIdAndClientMessageId(
                    conversationId, senderId, clientMessageId);
            if (existing.isPresent()) {
                return new WriteResult<>(messageMapper.toResponse(existing.get()), false);
            }
        }
        MessageEntity message = new MessageEntity();
        message.setId(Ids.newId());
        message.setConversationId(conversationId);
        message.setSenderId(senderId);
        message.setRecipientId(recipientId);
        message.setCiphertext(ciphertext);
        message.setMessageType(type);
        message.setStatus(MessageStatus.SENT);
        message.setClientMessageId(clientMessageId);
        message.setDeviceId(blankToNull(request.deviceId()));
        message.setKeyId(blankToNull(request.keyId()));
        message.setCreatedAt(clock.instant());
        try {
            messageRepository.save(message);
        } catch (DuplicateKeyException ex) {
            MessageEntity existing = messageRepository
                    .findByConversationIdAndSenderIdAndClientMessageId(conversationId, senderId, clientMessageId)
                    .orElseThrow(() -> ex);
            return new WriteResult<>(messageMapper.toResponse(existing), false);
        }
        conversationService.touch(conversation);
        MessageResponse response = messageMapper.toResponse(message);
        push("MESSAGE", response, recipientId);
        push("MESSAGE", response, senderId);
        if (sessionRegistry.isOnline(recipientId)) {
            markDelivered(message);
            response = messageMapper.toResponse(message);
            push("DELIVERED", messageMapper.toAck(message), senderId);
        }
        notificationService.notifyNewMessage(recipientId, senderId, conversationId);
        return new WriteResult<>(response, true);
    }

    public CursorPageResponse<MessageResponse> list(String userId, String conversationId, String cursor, int limit) {
        conversationService.requireMember(userId, conversationId);
        int pageSize = Math.min(Math.max(limit, 1), 50);
        CursorCodec.Cursor decoded = CursorCodec.decode(cursor);
        Criteria criteria = Criteria.where("conversationId").is(conversationId)
                .and("deletedForUserIds").ne(userId);
        if (decoded != null) {
            criteria = new Criteria().andOperator(
                    criteria,
                    new Criteria().orOperator(
                            Criteria.where("createdAt").lt(decoded.createdAt()),
                            new Criteria().andOperator(
                                    Criteria.where("createdAt").is(decoded.createdAt()),
                                    Criteria.where("_id").lt(decoded.id())
                            )
                    )
            );
        }
        Query query = Query.query(criteria)
                .with(Sort.by(Sort.Direction.DESC, "createdAt").and(Sort.by(Sort.Direction.DESC, "_id")))
                .limit(pageSize + 1);
        List<MessageEntity> found = mongoTemplate.find(query, MessageEntity.class);
        boolean hasNext = found.size() > pageSize;
        if (hasNext) {
            found = new ArrayList<>(found.subList(0, pageSize));
        }
        String next = null;
        if (hasNext && !found.isEmpty()) {
            MessageEntity last = found.get(found.size() - 1);
            next = CursorCodec.encode(last.getCreatedAt(), last.getId());
        }
        return new CursorPageResponse<>(found.stream().map(messageMapper::toResponse).toList(), next, hasNext);
    }

    public MessageAck markDelivered(String userId, String messageId) {
        MessageEntity message = requireVisible(userId, messageId);
        if (!message.getRecipientId().equals(userId)) {
            throw new ForbiddenException("Only the recipient can acknowledge delivery");
        }
        markDelivered(message);
        MessageAck ack = messageMapper.toAck(message);
        push("DELIVERED", ack, message.getSenderId());
        return ack;
    }

    public MessageAck markRead(String userId, String messageId) {
        MessageEntity message = requireVisible(userId, messageId);
        if (!message.getRecipientId().equals(userId)) {
            throw new ForbiddenException("Only the recipient can mark a message read");
        }
        if (message.isDeletedForEveryone()) {
            return messageMapper.toAck(message);
        }
        if (message.getStatus() != MessageStatus.READ) {
            var now = clock.instant();
            if (message.getDeliveredAt() == null) {
                message.setDeliveredAt(now);
            }
            message.setStatus(MessageStatus.READ);
            message.setReadAt(now);
            messageRepository.save(message);
        }
        MessageAck ack = messageMapper.toAck(message);
        push("READ", ack, message.getSenderId());
        return ack;
    }

    public int markConversationRead(String userId, String conversationId) {
        conversationService.requireMember(userId, conversationId);
        Query query = Query.query(Criteria.where("conversationId").is(conversationId)
                .and("recipientId").is(userId)
                .and("deletedForEveryone").ne(true)
                .and("deletedForUserIds").ne(userId)
                .and("status").ne(MessageStatus.READ))
                .limit(50);
        int updated = 0;
        for (MessageEntity message : mongoTemplate.find(query, MessageEntity.class)) {
            markRead(userId, message.getId());
            updated += 1;
        }
        return updated;
    }

    public MessageResponse delete(String userId, String messageId, DeletionScope scope) {
        MessageEntity message = requireVisible(userId, messageId);
        DeletionScope resolved = scope == null ? DeletionScope.me : scope;
        if (resolved == DeletionScope.everyone) {
            if (!message.getSenderId().equals(userId)) {
                throw new ForbiddenException("Only the sender can delete a message for everyone");
            }
            if (!message.isDeletedForEveryone()) {
                message.setDeletedForEveryone(true);
                message.setCiphertext("");
                messageRepository.save(message);
            }
            MessageResponse response = messageMapper.toResponse(message);
            push("MESSAGE", response, message.getSenderId());
            push("MESSAGE", response, message.getRecipientId());
            return response;
        }
        if (message.getDeletedForUserIds() == null) {
            message.setDeletedForUserIds(new java.util.LinkedHashSet<>());
        }
        if (message.getDeletedForUserIds().add(userId)) {
            messageRepository.save(message);
        }
        push("MESSAGE_HIDDEN", java.util.Map.of(
                "messageId", message.getId(),
                "conversationId", message.getConversationId()
        ), userId);
        return messageMapper.toResponse(message);
    }

    public void deliverPending(String userId) {
        for (MessageEntity message : messageRepository.findTop20ByRecipientIdAndStatusOrderByCreatedAtAsc(
                userId, MessageStatus.SENT)) {
            if (message.getDeletedForUserIds().contains(userId) || message.isDeletedForEveryone()) {
                continue;
            }
            push("MESSAGE", messageMapper.toResponse(message), userId);
            markDelivered(message);
            push("DELIVERED", messageMapper.toAck(message), message.getSenderId());
        }
    }

    private void markDelivered(MessageEntity message) {
        if (message.getStatus() == MessageStatus.SENT) {
            message.setStatus(MessageStatus.DELIVERED);
            message.setDeliveredAt(clock.instant());
            messageRepository.save(message);
        }
    }

    private void assertCanMessage(String senderId, String recipientId) {
        blockService.assertCanInteract(senderId, recipientId);
        if (!friendshipService.areFriends(senderId, recipientId)) {
            throw new ForbiddenException("Only friends can exchange messages");
        }
    }

    private MessageEntity requireVisible(String userId, String messageId) {
        Ids.require(messageId);
        MessageEntity message = messageRepository.findById(messageId)
                .orElseThrow(() -> new ResourceNotFoundException("Resource not found"));
        conversationService.requireMember(userId, message.getConversationId());
        if (!message.getSenderId().equals(userId) && !message.getRecipientId().equals(userId)) {
            throw new ResourceNotFoundException("Resource not found");
        }
        return message;
    }

    private void push(String type, Object data, String userId) {
        try {
            Map<String, Object> frame = new LinkedHashMap<>();
            frame.put("type", type);
            frame.put("data", data);
            sessionRegistry.send(userId, objectMapper.writeValueAsString(frame));
        } catch (Exception ex) {
            log.warn("Realtime frame was not sent type={} userId={}", type, userId);
        }
    }

    private String blankToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
