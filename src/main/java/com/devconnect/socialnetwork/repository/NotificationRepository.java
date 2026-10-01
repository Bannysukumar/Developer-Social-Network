package com.devconnect.socialnetwork.repository;

import com.devconnect.socialnetwork.domain.NotificationType;
import com.devconnect.socialnetwork.entity.NotificationEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.time.Instant;
import java.util.Optional;

public interface NotificationRepository extends MongoRepository<NotificationEntity, String> {

    Page<NotificationEntity> findByRecipientId(String recipientId, Pageable pageable);

    long countByRecipientIdAndReadFalse(String recipientId);

    Optional<NotificationEntity> findFirstByRecipientIdAndTypeAndReferenceIdAndReadFalseAndCreatedAtAfter(
            String recipientId, NotificationType type, String referenceId, Instant createdAt);

    void deleteByRecipientId(String recipientId);
}
