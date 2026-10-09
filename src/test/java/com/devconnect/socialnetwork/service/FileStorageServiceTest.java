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

        String key = storage.storeOpaque(new ByteArrayInputStream(new byte[] {1, 2, 3, 4}), 4);

        assertThat(key).startsWith("attachments/");
        assertThat(key).doesNotContain("..");
        assertThat(Files.exists(directory.resolve(key))).isTrue();
        assertThatThrownBy(() -> storage.storeOpaque(new ByteArrayInputStream(new byte[9]), 9))
                .isInstanceOf(ValidationFailedException.class);
        assertThatThrownBy(() -> storage.storeOpaque(new ByteArrayInputStream(new byte[] {1}), 2))
                .isInstanceOf(ValidationFailedException.class);
        storage.deleteKey("../outside");
        assertThatThrownBy(() -> storage.openKey("../outside")).isInstanceOf(ResourceNotFoundException.class);
    }
}
