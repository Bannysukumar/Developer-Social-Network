package com.devconnect.socialnetwork.scheduler;

import com.devconnect.socialnetwork.entity.PreKeyEntity;
import com.devconnect.socialnetwork.service.AttachmentService;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;

@Component
public class RetentionScheduler {

    private final MongoTemplate mongoTemplate;
    private final AttachmentService attachmentService;
    private final Clock clock;

    public RetentionScheduler(MongoTemplate mongoTemplate, AttachmentService attachmentService, Clock clock) {
        this.mongoTemplate = mongoTemplate;
        this.attachmentService = attachmentService;
        this.clock = clock;
    }

    @Scheduled(cron = "0 30 3 * * *")
    public void deleteConsumedPreKeys() {
        mongoTemplate.remove(
                Query.query(Criteria.where("consumed").is(true)
                        .and("consumedAt").lt(clock.instant().minus(Duration.ofDays(30)))),
                PreKeyEntity.class
        );
        attachmentService.purgeUnbound(Duration.ofHours(24));
    }
}
