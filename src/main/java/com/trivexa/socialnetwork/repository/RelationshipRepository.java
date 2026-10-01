package com.trivexa.socialnetwork.repository;

import com.trivexa.socialnetwork.entity.RelationshipEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface RelationshipRepository extends MongoRepository<RelationshipEntity, String> {

    Optional<RelationshipEntity> findByUserAIdAndUserBId(String userAId, String userBId);

    boolean existsByUserAIdAndUserBId(String userAId, String userBId);

    Page<RelationshipEntity> findByUserAIdOrUserBId(String userAId, String userBId, Pageable pageable);

    List<RelationshipEntity> findByUserAIdAndUserBIdIn(String userAId, Collection<String> userBIds);

    List<RelationshipEntity> findByUserBIdAndUserAIdIn(String userBId, Collection<String> userAIds);

    void deleteByUserAIdAndUserBId(String userAId, String userBId);

    List<RelationshipEntity> findByUserAIdOrUserBId(String userAId, String userBId);
}
