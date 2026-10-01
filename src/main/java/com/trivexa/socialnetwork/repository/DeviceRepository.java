package com.trivexa.socialnetwork.repository;

import com.trivexa.socialnetwork.entity.DeviceEntity;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;
import java.util.Optional;

public interface DeviceRepository extends MongoRepository<DeviceEntity, String> {

    List<DeviceEntity> findByUserIdAndRevokedFalse(String userId);

    List<DeviceEntity> findByUserId(String userId);

    Optional<DeviceEntity> findByIdAndUserId(String id, String userId);

    long countByUserIdAndRevokedFalse(String userId);
}
