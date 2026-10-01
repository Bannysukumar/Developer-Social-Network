package com.devconnect.socialnetwork.repository;

import com.devconnect.socialnetwork.entity.AuditEventEntity;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface AuditEventRepository extends MongoRepository<AuditEventEntity, String> {
}
