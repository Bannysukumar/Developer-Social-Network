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
import java.io.OutputStream;
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

    public StoredObject storeOpaque(InputStream input, long declaredSize) {
        long max = properties.getStorage().getMaxAttachmentBytes();
        if (declaredSize > max) {
            throw new ValidationFailedException("File size is not allowed");
        }
        String id = Ids.newId();
        Path root = Path.of(properties.getStorage().getLocation()).toAbsolutePath().normalize();
        Path directory = root.resolve("attachments").normalize();
        Path target = directory.resolve(id).normalize();
        if (!target.startsWith(directory)) {
            throw new ValidationFailedException("File could not be stored");
        }
        try {
            Files.createDirectories(directory);
            long written = writeLimited(target, input, max);
            if (written <= 0) {
                Files.deleteIfExists(target);
                throw new ValidationFailedException("File size is not allowed");
            }
            return new StoredObject("attachments/" + id, written);
        } catch (ValidationFailedException ex) {
            throw ex;
        } catch (IOException ex) {
            try {
                Files.deleteIfExists(target);
            } catch (IOException ignored) {
                // The failed upload is not referenced.
            }
            throw new IllegalStateException("File could not be stored", ex);
        }
    }

    public record StoredObject(String storageKey, long size) {
    }

    public StoredFileEntity require(String fileId) {
        Ids.require(fileId);
        return repository.findById(fileId).orElseThrow(() -> new ResourceNotFoundException("Resource not found"));
    }

    public InputStream open(StoredFileEntity file) {
        return openKey(file.getStorageKey());
    }

    public InputStream openKey(String storageKey) {
        Path target = resolveKey(storageKey);
        if (!Files.exists(target)) {
            throw new ResourceNotFoundException("Resource not found");
        }
        try {
            return Files.newInputStream(target);
        } catch (IOException ex) {
            throw new ResourceNotFoundException("Resource not found");
        }
    }

    public void deleteKey(String storageKey) {
        if (storageKey == null || storageKey.isBlank()) {
            return;
        }
        try {
            Files.deleteIfExists(resolveKey(storageKey));
        } catch (IOException | ResourceNotFoundException ignored) {
            // Metadata removal still drops the reference.
        }
    }

    private Path resolveKey(String storageKey) {
        if (storageKey == null || storageKey.isBlank() || storageKey.contains("..")
                || storageKey.startsWith("/") || storageKey.startsWith("\\") || storageKey.contains(":")) {
            throw new ResourceNotFoundException("Resource not found");
        }
        Path root = Path.of(properties.getStorage().getLocation()).toAbsolutePath().normalize();
        Path target = root.resolve(storageKey).normalize();
        if (!target.startsWith(root)) {
            throw new ResourceNotFoundException("Resource not found");
        }
        return target;
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

    private long writeLimited(Path target, InputStream input, long max) throws IOException {
        long total = 0;
        try (InputStream in = input; OutputStream out = Files.newOutputStream(target)) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) >= 0) {
                total += read;
                if (total > max) {
                    throw new ValidationFailedException("File size is not allowed");
                }
                out.write(buffer, 0, read);
            }
        } catch (ValidationFailedException ex) {
            Files.deleteIfExists(target);
            throw ex;
        }
        return total;
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
