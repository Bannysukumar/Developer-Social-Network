package com.devconnect.socialnetwork.repository;

import com.devconnect.socialnetwork.entity.RevokedAccessTokenEntity;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface RevokedAccessTokenRepository extends MongoRepository<RevokedAccessTokenEntity, String> {

    boolean existsByJti(String jti);
}
