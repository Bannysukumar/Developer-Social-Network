package com.devconnect.socialnetwork.service;

import com.devconnect.socialnetwork.config.AppProperties;
import com.devconnect.socialnetwork.exception.ResourceNotFoundException;
import com.devconnect.socialnetwork.exception.ValidationFailedException;
import com.devconnect.socialnetwork.repository.StoredFileRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.ByteArrayInputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

class FileStorageServiceTest {

    @TempDir
    Path directory;

    @Test
    void storesCiphertextUnderAServerKeyAndRejectsATraversalKey() throws Exception {
        AppProperties properties = new AppProperties();
        properties.getStorage().setLocation(directory.toString());
        properties.getStorage().setMaxAttachmentBytes(8);
        FileStorageService storage = new FileStorageService(properties, mock(StoredFileRepository.class),
                Clock.fixed(Instant.parse("2026-10-09T12:00:00Z"), ZoneOffset.UTC));

        FileStorageService.StoredObject stored = storage.storeOpaque(new ByteArrayInputStream(new byte[] {1, 2, 3, 4}), 4);

        assertThat(stored.storageKey()).startsWith("attachments/");
        assertThat(stored.storageKey()).doesNotContain("..");
        assertThat(stored.size()).isEqualTo(4);
        assertThat(Files.exists(directory.resolve(stored.storageKey()))).isTrue();
        assertThat(storage.openKey(stored.storageKey()).readAllBytes()).containsExactly(1, 2, 3, 4);
        assertThatThrownBy(() -> storage.storeOpaque(new ByteArrayInputStream(new byte[9]), 9))
                .isInstanceOf(ValidationFailedException.class);
        assertThat(storage.storeOpaque(new ByteArrayInputStream(new byte[] {1}), 2).size()).isEqualTo(1);
        storage.deleteKey("../outside");
        assertThatThrownBy(() -> storage.openKey("../outside")).isInstanceOf(ResourceNotFoundException.class);
    }
}
