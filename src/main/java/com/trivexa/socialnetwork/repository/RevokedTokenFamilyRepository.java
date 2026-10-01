package com.trivexa.socialnetwork.repository;

import com.trivexa.socialnetwork.entity.RevokedTokenFamilyEntity;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface RevokedTokenFamilyRepository extends MongoRepository<RevokedTokenFamilyEntity, String> {
}
