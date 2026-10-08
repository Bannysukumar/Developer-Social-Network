package com.devconnect.socialnetwork.service;

import com.devconnect.socialnetwork.config.AppProperties;
import com.devconnect.socialnetwork.entity.StoredFileEntity;
import com.devconnect.socialnetwork.exception.ResourceNotFoundException;
import com.devconnect.socialnetwork.exception.ValidationFailedException;
import com.devconnect.socialnetwork.repository.StoredFileRepository;
import com.devconnect.socialnetwork.util.Ids;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.util.List;

@Service
public class FileStorageService {

    private final AppProperties properties;
    private final StoredFileRepository repository;
    private final Clock clock;

    public FileStorageService(AppProperties properties, StoredFileRepository repository, Clock clock) {
        this.properties = properties;
        this.repository = repository;
        this.clock = clock;
    }

    public StoredFileEntity storeProfileImage(String ownerId, byte[] bytes) {
        if (bytes == null || bytes.length == 0 || bytes.length > properties.getStorage().getMaxImageBytes()) {
            throw new ValidationFailedException("Image size is not allowed");
        }
        String contentType = detectImage(bytes);
        String id = Ids.newId();
        Path root = Path.of(properties.getStorage().getLocation()).toAbsolutePath().normalize();
        Path target = root.resolve(id).normalize();
        if (!target.startsWith(root)) {
            throw new ValidationFailedException("Image could not be stored");
        }
        try {
            Files.createDirectories(root);
            Files.write(target, bytes);
        } catch (IOException ex) {
            throw new IllegalStateException("Image could not be stored", ex);
        }
        StoredFileEntity entity = new StoredFileEntity();
        entity.setId(id);
        entity.setOwnerId(ownerId);
        entity.setContentType(contentType);
        entity.setSize(bytes.length);
        entity.setStorageKey(id);
        entity.setCreatedAt(clock.instant());
        return repository.save(entity);
    }

    public StoredFileEntity require(String fileId) {
        Ids.require(fileId);
        return repository.findById(fileId).orElseThrow(() -> new ResourceNotFoundException("Resource not found"));
    }

    public InputStream open(StoredFileEntity file) {
        Path root = Path.of(properties.getStorage().getLocation()).toAbsolutePath().normalize();
        Path target = root.resolve(file.getStorageKey()).normalize();
        if (!target.startsWith(root) || !Files.exists(target)) {
            throw new ResourceNotFoundException("Resource not found");
        }
        try {
            return Files.newInputStream(target);
        } catch (IOException ex) {
            throw new ResourceNotFoundException("Resource not found");
        }
    }

    public void deleteAllForOwner(String ownerId) {
        List<StoredFileEntity> files = repository.findByOwnerId(ownerId);
        Path root = Path.of(properties.getStorage().getLocation()).toAbsolutePath().normalize();
        for (StoredFileEntity file : files) {
            Path target = root.resolve(file.getStorageKey()).normalize();
            if (target.startsWith(root)) {
                try {
                    Files.deleteIfExists(target);
                } catch (IOException ignored) {
                    // The metadata row is still removed so the file is no longer referenced.
                }
            }
        }
        repository.deleteAll(files);
    }

    public void delete(String fileId) {
        if (fileId == null) {
            return;
        }
        repository.findById(fileId).ifPresent(file -> {
            Path root = Path.of(properties.getStorage().getLocation()).toAbsolutePath().normalize();
            Path target = root.resolve(file.getStorageKey()).normalize();
            if (target.startsWith(root)) {
                try {
                    Files.deleteIfExists(target);
                } catch (IOException ignored) {
                    // Metadata removal still drops the reference.
                }
            }
            repository.delete(file);
        });
    }

    private String detectImage(byte[] bytes) {
        if (bytes.length >= 3 && (bytes[0] & 0xFF) == 0xFF && (bytes[1] & 0xFF) == 0xD8 && (bytes[2] & 0xFF) == 0xFF) {
            return "image/jpeg";
        }
        if (bytes.length >= 8
                && bytes[0] == (byte) 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47) {
            return "image/png";
        }
        if (bytes.length >= 12
                && bytes[0] == 'R' && bytes[1] == 'I' && bytes[2] == 'F' && bytes[3] == 'F'
                && bytes[8] == 'W' && bytes[9] == 'E' && bytes[10] == 'B' && bytes[11] == 'P') {
            return "image/webp";
        }
        throw new ValidationFailedException("Only JPEG, PNG, and WebP images are accepted");
    }
}
