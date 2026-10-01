package com.trivexa.socialnetwork.repository;

import com.trivexa.socialnetwork.entity.AuditEventEntity;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface AuditEventRepository extends MongoRepository<AuditEventEntity, String> {
}
