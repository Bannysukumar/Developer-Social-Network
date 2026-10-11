package com.devconnect.socialnetwork.service;

import com.devconnect.socialnetwork.dto.request.KeyBackupRequest;
import com.devconnect.socialnetwork.dto.response.KeyBackupResponse;
import com.devconnect.socialnetwork.entity.KeyBackupEntity;
import com.devconnect.socialnetwork.exception.ValidationFailedException;
import com.devconnect.socialnetwork.repository.KeyBackupRepository;
import org.springframework.stereotype.Service;

import java.time.Instant;

@Service
public class KeyBackupService {

    private final KeyBackupRepository repository;

    public KeyBackupService(KeyBackupRepository repository) {
        this.repository = repository;
    }

    public KeyBackupResponse find(String userId) {
        return repository.findByUserId(userId).map(this::toResponse).orElse(null);
    }

    public KeyBackupResponse save(String userId, KeyBackupRequest request) {
        if (!"scrypt".equals(request.kdf())) {
            throw new ValidationFailedException("Unsupported key backup format");
        }
        KeyBackupEntity entity = repository.findByUserId(userId).orElseGet(KeyBackupEntity::new);
        entity.setUserId(userId);
        entity.setVersion(request.version());
        entity.setKdf(request.kdf());
        entity.setSalt(request.salt());
        entity.setIv(request.iv());
        entity.setCiphertext(request.ciphertext());
        entity.setUpdatedAt(Instant.now());
        return toResponse(repository.save(entity));
    }

    private KeyBackupResponse toResponse(KeyBackupEntity entity) {
        return new KeyBackupResponse(
                entity.getVersion(),
                entity.getKdf(),
                entity.getSalt(),
                entity.getIv(),
                entity.getCiphertext(),
                entity.getUpdatedAt());
    }
}
