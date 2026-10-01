package com.trivexa.socialnetwork.repository;

import com.trivexa.socialnetwork.entity.RevokedAccessTokenEntity;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface RevokedAccessTokenRepository extends MongoRepository<RevokedAccessTokenEntity, String> {

    boolean existsByJti(String jti);
}
