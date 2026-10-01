package com.trivexa.socialnetwork.repository;

import com.trivexa.socialnetwork.entity.StoredFileEntity;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface StoredFileRepository extends MongoRepository<StoredFileEntity, String> {

    List<StoredFileEntity> findByOwnerId(String ownerId);
}
