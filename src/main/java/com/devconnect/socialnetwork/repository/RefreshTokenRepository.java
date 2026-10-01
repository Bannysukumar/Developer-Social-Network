package com.devconnect.socialnetwork.repository;

import com.devconnect.socialnetwork.entity.RefreshTokenEntity;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;
import java.util.Optional;

public interface RefreshTokenRepository extends MongoRepository<RefreshTokenEntity, String> {

    Optional<RefreshTokenEntity> findByTokenHash(String tokenHash);

    List<RefreshTokenEntity> findByFamilyId(String familyId);

    List<RefreshTokenEntity> findByUserIdAndRevokedFalse(String userId);

    List<RefreshTokenEntity> findByDeviceIdAndRevokedFalse(String deviceId);

    void deleteByUserId(String userId);
}
