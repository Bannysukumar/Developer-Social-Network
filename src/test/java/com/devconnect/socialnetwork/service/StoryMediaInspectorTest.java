package com.devconnect.socialnetwork.service;

import com.devconnect.socialnetwork.exception.ValidationFailedException;
import org.junit.jupiter.api.Test;

import java.nio.ByteBuffer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class StoryMediaInspectorTest {

    @Test
    void acceptsAJpegAndRejectsPlainText() {
        byte[] jpeg = new byte[] {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xD9};
        StoryMediaInspector.Inspected inspected = StoryMediaInspector.inspect(jpeg);
        assertThat(inspected.mediaType()).isEqualTo("IMAGE");
        assertThat(inspected.contentType()).isEqualTo("image/jpeg");
        assertThatThrownBy(() -> StoryMediaInspector.inspect("hello".getBytes()))
                .isInstanceOf(ValidationFailedException.class);
    }

    @Test
    void acceptsAShortMp4AndRejectsALongOne() {
        assertThat(StoryMediaInspector.inspect(mp4(1, 5)).contentType()).isEqualTo("video/mp4");
        assertThatThrownBy(() -> StoryMediaInspector.inspect(mp4(1, 16)))
                .isInstanceOf(ValidationFailedException.class)
                .hasMessageContaining("15 seconds");
    }

    @Test
    void readsAWebmDuration() {
        byte[] webm = new byte[16];
        webm[0] = 0x1A;
        webm[1] = 0x45;
        webm[2] = (byte) 0xDF;
        webm[3] = (byte) 0xA3;
        webm[4] = 0x44;
        webm[5] = (byte) 0x89;
        webm[6] = (byte) 0x88;
        ByteBuffer.wrap(webm, 7, 8).putDouble(4.0);
        assertThat(StoryMediaInspector.inspect(webm).mediaType()).isEqualTo("VIDEO");
    }

    @Test
    void rejectsAnOversizedCaption() {
        assertThatThrownBy(() -> StoryMediaInspector.caption("x".repeat(161)))
                .isInstanceOf(ValidationFailedException.class);
    }

    private static byte[] mp4(int timescale, int duration) {
        byte[] bytes = new byte[40];
        bytes[4] = 'f';
        bytes[5] = 't';
        bytes[6] = 'y';
        bytes[7] = 'p';
        bytes[8] = 'm';
        bytes[9] = 'v';
        bytes[10] = 'h';
        bytes[11] = 'd';
        ByteBuffer buffer = ByteBuffer.wrap(bytes);
        buffer.putInt(24, timescale);
        buffer.putInt(28, duration);
        return bytes;
    }
}
