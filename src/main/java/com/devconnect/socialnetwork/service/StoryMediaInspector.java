package com.devconnect.socialnetwork.service;

import com.devconnect.socialnetwork.exception.ValidationFailedException;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Locale;

/** Checks story bytes for an allowed image or short video. Duration is read from the file, not from the client. */
public final class StoryMediaInspector {

    public static final int MAX_IMAGE_BYTES = 5_242_880;
    public static final int MAX_VIDEO_BYTES = 8_388_608;
    public static final double MAX_VIDEO_SECONDS = 15.0;

    private StoryMediaInspector() {
    }

    public record Inspected(String mediaType, String contentType) {
    }

    public static Inspected inspect(byte[] bytes) {
        if (bytes == null || bytes.length == 0) {
            throw new ValidationFailedException("Choose an image or a short video");
        }
        if (isJpeg(bytes)) {
            limit(bytes.length, MAX_IMAGE_BYTES);
            return new Inspected("IMAGE", "image/jpeg");
        }
        if (isPng(bytes)) {
            limit(bytes.length, MAX_IMAGE_BYTES);
            return new Inspected("IMAGE", "image/png");
        }
        if (isGif(bytes)) {
            limit(bytes.length, MAX_IMAGE_BYTES);
            return new Inspected("IMAGE", "image/gif");
        }
        if (isWebp(bytes)) {
            limit(bytes.length, MAX_IMAGE_BYTES);
            return new Inspected("IMAGE", "image/webp");
        }
        if (isMp4(bytes)) {
            limit(bytes.length, MAX_VIDEO_BYTES);
            requireDuration(mp4Seconds(bytes));
            return new Inspected("VIDEO", "video/mp4");
        }
        if (isWebm(bytes)) {
            limit(bytes.length, MAX_VIDEO_BYTES);
            requireDuration(webmSeconds(bytes));
            return new Inspected("VIDEO", "video/webm");
        }
        throw new ValidationFailedException("Stories accept JPEG, PNG, GIF, WebP, MP4, or WebM");
    }

    public static String textStyle(String value) {
        String style = value == null || value.isBlank() ? "plain" : value.trim().toLowerCase(Locale.ROOT);
        if (!style.equals("plain") && !style.equals("light") && !style.equals("dark")) {
            throw new ValidationFailedException("That story style is not supported");
        }
        return style;
    }

    public static String caption(String value) {
        if (value == null) {
            return "";
        }
        String trimmed = value.replaceAll("[\\p{Cntrl}&&[^\\n]]", "").trim();
        if (trimmed.length() > 160) {
            throw new ValidationFailedException("Captions can be up to 160 characters");
        }
        return trimmed;
    }

    public static String clientStoryId(String value) {
        if (value == null || !value.matches("[A-Za-z0-9_-]{8,64}")) {
            throw new ValidationFailedException("The story could not be published");
        }
        return value;
    }

    private static void limit(int size, int max) {
        if (size > max) {
            throw new ValidationFailedException("That file is too large for a story");
        }
    }

    private static void requireDuration(Double seconds) {
        if (seconds == null || seconds <= 0 || seconds > MAX_VIDEO_SECONDS) {
            throw new ValidationFailedException("Videos must be 15 seconds or shorter");
        }
    }

    private static boolean isJpeg(byte[] bytes) {
        return bytes.length > 3 && (bytes[0] & 0xFF) == 0xFF && (bytes[1] & 0xFF) == 0xD8 && (bytes[2] & 0xFF) == 0xFF;
    }

    private static boolean isPng(byte[] bytes) {
        return bytes.length > 8 && bytes[0] == (byte) 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47;
    }

    private static boolean isGif(byte[] bytes) {
        return bytes.length > 6 && bytes[0] == 'G' && bytes[1] == 'I' && bytes[2] == 'F' && bytes[3] == '8';
    }

    private static boolean isWebp(byte[] bytes) {
        return bytes.length > 12 && bytes[0] == 'R' && bytes[1] == 'I' && bytes[2] == 'F' && bytes[3] == 'F'
                && bytes[8] == 'W' && bytes[9] == 'E' && bytes[10] == 'B' && bytes[11] == 'P';
    }

    private static boolean isMp4(byte[] bytes) {
        return indexOf(bytes, new byte[]{'f', 't', 'y', 'p'}) == 4;
    }

    private static boolean isWebm(byte[] bytes) {
        return bytes.length > 4 && (bytes[0] & 0xFF) == 0x1A && (bytes[1] & 0xFF) == 0x45
                && (bytes[2] & 0xFF) == 0xDF && (bytes[3] & 0xFF) == 0xA3;
    }

    static Double mp4Seconds(byte[] bytes) {
        int at = indexOf(bytes, new byte[]{'m', 'v', 'h', 'd'});
        if (at < 0 || at + 20 >= bytes.length) {
            return null;
        }
        int version = bytes[at + 4] & 0xFF;
        try {
            ByteBuffer buffer = ByteBuffer.wrap(bytes).order(ByteOrder.BIG_ENDIAN);
            if (version == 0 && at + 24 < bytes.length) {
                long timescale = Integer.toUnsignedLong(buffer.getInt(at + 16));
                long duration = Integer.toUnsignedLong(buffer.getInt(at + 20));
                if (timescale == 0) {
                    return null;
                }
                return duration / (double) timescale;
            }
            if (version == 1 && at + 36 < bytes.length) {
                long timescale = Integer.toUnsignedLong(buffer.getInt(at + 24));
                long duration = buffer.getLong(at + 28);
                if (timescale == 0 || duration < 0) {
                    return null;
                }
                return duration / (double) timescale;
            }
        } catch (IndexOutOfBoundsException ignored) {
            return null;
        }
        return null;
    }

    static Double webmSeconds(byte[] bytes) {
        for (int index = 0; index < bytes.length - 11; index += 1) {
            if ((bytes[index] & 0xFF) == 0x44 && (bytes[index + 1] & 0xFF) == 0x89 && (bytes[index + 2] & 0xFF) == 0x88) {
                ByteBuffer buffer = ByteBuffer.wrap(bytes, index + 3, 8).order(ByteOrder.BIG_ENDIAN);
                double seconds = buffer.getDouble();
                if (Double.isFinite(seconds)) {
                    return seconds;
                }
            }
        }
        return null;
    }

    private static int indexOf(byte[] bytes, byte[] needle) {
        outer:
        for (int index = 0; index <= bytes.length - needle.length; index += 1) {
            for (int offset = 0; offset < needle.length; offset += 1) {
                if (bytes[index + offset] != needle[offset]) {
                    continue outer;
                }
            }
            return index;
        }
        return -1;
    }
}
