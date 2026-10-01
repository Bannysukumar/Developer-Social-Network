package com.devconnect.socialnetwork.repository;

import com.devconnect.socialnetwork.entity.UserEntity;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface UserRepository extends MongoRepository<UserEntity, String> {

    Optional<UserEntity> findByNormalizedUsername(String normalizedUsername);

    Optional<UserEntity> findByNormalizedEmail(String normalizedEmail);

    boolean existsByNormalizedUsername(String normalizedUsername);

    boolean existsByNormalizedEmail(String normalizedEmail);

    List<UserEntity> findByIdIn(Collection<String> ids);
}
