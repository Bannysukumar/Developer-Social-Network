package com.devconnect.socialnetwork.repository;

import com.devconnect.socialnetwork.entity.KeyBackupEntity;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.Optional;

public interface KeyBackupRepository extends MongoRepository<KeyBackupEntity, String> {

    Optional<KeyBackupEntity> findByUserId(String userId);
}
