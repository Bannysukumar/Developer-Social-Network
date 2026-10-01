package com.devconnect.socialnetwork.config;

import com.devconnect.socialnetwork.entity.FriendRequestEntity;
import com.devconnect.socialnetwork.entity.MessageEntity;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.index.Index;
import org.springframework.data.mongodb.core.index.PartialIndexFilter;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.stereotype.Component;

@Component
public class MongoIndexInitializer implements ApplicationRunner {

    private final MongoTemplate mongoTemplate;

    public MongoIndexInitializer(MongoTemplate mongoTemplate) {
        this.mongoTemplate = mongoTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        mongoTemplate.indexOps(FriendRequestEntity.class).ensureIndex(new Index()
                .on("senderId", Sort.Direction.ASC)
                .on("recipientId", Sort.Direction.ASC)
                .unique()
                .partial(PartialIndexFilter.of(Criteria.where("status").is("PENDING")))
                .named("unique_pending_friend_request"));

        mongoTemplate.indexOps(MessageEntity.class).ensureIndex(new Index()
                .on("conversationId", Sort.Direction.ASC)
                .on("senderId", Sort.Direction.ASC)
                .on("clientMessageId", Sort.Direction.ASC)
                .unique()
                .partial(PartialIndexFilter.of(Criteria.where("clientMessageId").exists(true)))
                .named("unique_client_message"));
    }
}
