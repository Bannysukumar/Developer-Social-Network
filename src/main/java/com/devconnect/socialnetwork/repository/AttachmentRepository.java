package com.devconnect.socialnetwork.repository;

import com.devconnect.socialnetwork.entity.AttachmentEntity;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.time.Instant;
import java.util.List;

public interface AttachmentRepository extends MongoRepository<AttachmentEntity, String> {

    List<AttachmentEntity> findByMessageIdIsNullAndCreatedAtBefore(Instant cutoff);
}
