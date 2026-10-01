package com.devconnect.socialnetwork.repository;

import com.devconnect.socialnetwork.entity.IdentityKeyEntity;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;
import java.util.Optional;

public interface IdentityKeyRepository extends MongoRepository<IdentityKeyEntity, String> {

    Optional<IdentityKeyEntity> findByDeviceId(String deviceId);

    List<IdentityKeyEntity> findByUserId(String userId);

    void deleteByDeviceId(String deviceId);

    void deleteByUserId(String userId);
}
