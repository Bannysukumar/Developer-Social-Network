package com.devconnect.socialnetwork.repository;

import com.devconnect.socialnetwork.entity.PasswordResetTokenEntity;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.Optional;

public interface PasswordResetTokenRepository extends MongoRepository<PasswordResetTokenEntity, String> {

    Optional<PasswordResetTokenEntity> findByTokenHash(String tokenHash);

    void deleteByUserId(String userId);
}
