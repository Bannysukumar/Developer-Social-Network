package com.trivexa.socialnetwork.repository;

import com.trivexa.socialnetwork.entity.EmailVerificationTokenEntity;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.Optional;

public interface EmailVerificationTokenRepository extends MongoRepository<EmailVerificationTokenEntity, String> {

    Optional<EmailVerificationTokenEntity> findByTokenHash(String tokenHash);

    void deleteByUserId(String userId);
}
