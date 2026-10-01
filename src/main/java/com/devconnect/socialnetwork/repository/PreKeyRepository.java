package com.devconnect.socialnetwork.repository;

import com.devconnect.socialnetwork.domain.PreKeyType;
import com.devconnect.socialnetwork.entity.PreKeyEntity;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.Optional;

public interface PreKeyRepository extends MongoRepository<PreKeyEntity, String> {

    Optional<PreKeyEntity> findByDeviceIdAndPreKeyId(String deviceId, int preKeyId);

    Optional<PreKeyEntity> findByDeviceIdAndType(String deviceId, PreKeyType type);

    long countByDeviceIdAndTypeAndConsumedFalse(String deviceId, PreKeyType type);

    void deleteByDeviceId(String deviceId);

    void deleteByDeviceIdAndType(String deviceId, PreKeyType type);

    void deleteByUserId(String userId);
}
