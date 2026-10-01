package com.trivexa.socialnetwork.repository;

import com.trivexa.socialnetwork.entity.ConversationEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.Optional;

public interface ConversationRepository extends MongoRepository<ConversationEntity, String> {

    Optional<ConversationEntity> findByParticipantKey(String participantKey);

    Page<ConversationEntity> findByParticipantIdsContaining(String userId, Pageable pageable);
}
