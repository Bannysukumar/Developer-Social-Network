package com.devconnect.socialnetwork.repository;

import com.devconnect.socialnetwork.entity.BlockEntity;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface BlockRepository extends MongoRepository<BlockEntity, String> {

    boolean existsByBlockerIdAndBlockedId(String blockerId, String blockedId);

    Optional<BlockEntity> findByBlockerIdAndBlockedId(String blockerId, String blockedId);

    void deleteByBlockerIdAndBlockedId(String blockerId, String blockedId);

    List<BlockEntity> findByBlockerIdOrBlockedId(String blockerId, String blockedId);

    List<BlockEntity> findByBlockerIdAndBlockedIdIn(String blockerId, Collection<String> blockedIds);

    List<BlockEntity> findByBlockedIdAndBlockerIdIn(String blockedId, Collection<String> blockerIds);

    void deleteByBlockerIdOrBlockedId(String blockerId, String blockedId);
}
