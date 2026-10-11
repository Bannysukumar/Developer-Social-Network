package com.devconnect.socialnetwork.repository;

import com.devconnect.socialnetwork.entity.MessageReactionEntity;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;
import java.util.Optional;

public interface MessageReactionRepository extends MongoRepository<MessageReactionEntity, String> {

    List<MessageReactionEntity> findByMessageIdIn(List<String> messageIds);

    List<MessageReactionEntity> findByMessageId(String messageId);

    Optional<MessageReactionEntity> findByMessageIdAndUserId(String messageId, String userId);

    void deleteByMessageIdAndUserId(String messageId, String userId);
}
