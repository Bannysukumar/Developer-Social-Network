package com.trivexa.socialnetwork.repository;

import com.trivexa.socialnetwork.domain.MessageStatus;
import com.trivexa.socialnetwork.entity.MessageEntity;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;
import java.util.Optional;

public interface MessageRepository extends MongoRepository<MessageEntity, String> {

    Optional<MessageEntity> findByConversationIdAndSenderIdAndClientMessageId(
            String conversationId, String senderId, String clientMessageId);

    List<MessageEntity> findTop20ByRecipientIdAndStatusOrderByCreatedAtAsc(String recipientId, MessageStatus status);
}
