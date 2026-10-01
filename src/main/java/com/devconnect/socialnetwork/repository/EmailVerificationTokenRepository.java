package com.devconnect.socialnetwork.repository;

import com.devconnect.socialnetwork.entity.EmailVerificationTokenEntity;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.Optional;

public interface EmailVerificationTokenRepository extends MongoRepository<EmailVerificationTokenEntity, String> {

    Optional<EmailVerificationTokenEntity> findByTokenHash(String tokenHash);

    void deleteByUserId(String userId);
}
