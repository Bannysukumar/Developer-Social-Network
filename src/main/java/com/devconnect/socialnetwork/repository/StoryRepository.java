package com.devconnect.socialnetwork.repository;

import com.devconnect.socialnetwork.entity.StoryEntity;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface StoryRepository extends MongoRepository<StoryEntity, String> {

    Optional<StoryEntity> findByOwnerIdAndClientStoryId(String ownerId, String clientStoryId);

    List<StoryEntity> findByOwnerId(String ownerId);

    List<StoryEntity> findByStorageKey(String storageKey);

    List<StoryEntity> findByOwnerIdIn(Collection<String> ownerIds);

    @Query("{ 'ownerId': { $in: ?0 }, 'deletedAt': null, 'expiresAt': { $gt: ?1 } }")
    List<StoryEntity> findActiveByOwnerIdIn(Collection<String> ownerIds, Instant now);

    List<StoryEntity> findTop40ByDeletedAtIsNullAndExpiresAtBefore(Instant cutoff);
}
