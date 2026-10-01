package com.devconnect.socialnetwork.repository;

import com.devconnect.socialnetwork.entity.RevokedTokenFamilyEntity;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface RevokedTokenFamilyRepository extends MongoRepository<RevokedTokenFamilyEntity, String> {
}
