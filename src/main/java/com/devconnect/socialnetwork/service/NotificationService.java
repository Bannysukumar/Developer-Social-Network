package com.devconnect.socialnetwork.service;

import com.devconnect.socialnetwork.domain.NotificationType;
import com.devconnect.socialnetwork.dto.PageResponse;
import com.devconnect.socialnetwork.dto.response.CountResponse;
import com.devconnect.socialnetwork.dto.response.NotificationListResponse;
import com.devconnect.socialnetwork.dto.response.NotificationResponse;
import com.devconnect.socialnetwork.entity.NotificationEntity;
import com.devconnect.socialnetwork.exception.ResourceNotFoundException;
import com.devconnect.socialnetwork.repository.NotificationRepository;
import com.devconnect.socialnetwork.util.Ids;
import com.devconnect.socialnetwork.util.Paging;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

@Service
public class NotificationService {

    private final NotificationRepository repository;
    private final MongoTemplate mongoTemplate;
    private final Clock clock;

    public NotificationService(NotificationRepository repository, MongoTemplate mongoTemplate, Clock clock) {
        this.repository = repository;
        this.mongoTemplate = mongoTemplate;
        this.clock = clock;
    }

    public void notify(String recipientId, NotificationType type, String actorId, String referenceId, String message) {
        NotificationEntity entity = new NotificationEntity();
        entity.setId(Ids.newId());
        entity.setRecipientId(recipientId);
        entity.setType(type);
        entity.setActorId(actorId);
        entity.setReferenceId(referenceId);
        entity.setMessage(message);
        entity.setRead(false);
        entity.setCreatedAt(clock.instant());
        repository.save(entity);
    }

    public void notifyNewMessage(String recipientId, String actorId, String conversationId) {
        Instant cutoff = clock.instant().minus(Duration.ofMinutes(5));
        boolean recent = repository
                .findFirstByRecipientIdAndTypeAndReferenceIdAndReadFalseAndCreatedAtAfter(
                        recipientId, NotificationType.NEW_MESSAGE, conversationId, cutoff)
                .isPresent();
        if (!recent) {
            notify(recipientId, NotificationType.NEW_MESSAGE, actorId, conversationId, "You received a new encrypted message");
        }
    }

    public NotificationListResponse list(String userId, int page, int size) {
        Page<NotificationEntity> result = repository.findByRecipientId(
                userId, Paging.page(page, size, 50, Sort.by(Sort.Direction.DESC, "createdAt")));
        PageResponse<NotificationResponse> mapped = Paging.map(result, result.getContent().stream().map(this::toResponse).toList());
        return new NotificationListResponse(mapped, repository.countByRecipientIdAndReadFalse(userId));
    }

    public NotificationResponse markRead(String userId, String notificationId) {
        Ids.require(notificationId);
        NotificationEntity entity = repository.findById(notificationId)
                .orElseThrow(() -> new ResourceNotFoundException("Resource not found"));
        if (!entity.getRecipientId().equals(userId)) {
            throw new ResourceNotFoundException("Resource not found");
        }
        if (!entity.isRead()) {
            entity.setRead(true);
            repository.save(entity);
        }
        return toResponse(entity);
    }

    public CountResponse markAllRead(String userId) {
        var result = mongoTemplate.updateMulti(
                Query.query(Criteria.where("recipientId").is(userId).and("read").is(false)),
                new Update().set("read", true),
                NotificationEntity.class
        );
        return new CountResponse(result.getModifiedCount());
    }

    public void deleteForRecipient(String userId) {
        repository.deleteByRecipientId(userId);
    }

    public void anonymizeActor(String userId) {
        mongoTemplate.updateMulti(
                Query.query(Criteria.where("actorId").is(userId)),
                new Update().set("actorId", null).set("message", "An account was removed"),
                NotificationEntity.class
        );
    }

    private NotificationResponse toResponse(NotificationEntity entity) {
        return new NotificationResponse(
                entity.getId(),
                entity.getType(),
                entity.getActorId(),
                entity.getReferenceId(),
                entity.getMessage(),
                entity.isRead(),
                entity.getCreatedAt()
        );
    }
}
