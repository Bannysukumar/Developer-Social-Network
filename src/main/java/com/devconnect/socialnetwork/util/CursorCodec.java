package com.devconnect.socialnetwork.util;

import com.devconnect.socialnetwork.exception.ValidationFailedException;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;

public final class CursorCodec {

    public record Cursor(Instant createdAt, String id) {
    }

    private CursorCodec() {
    }

    public static String encode(Instant createdAt, String id) {
        String raw = createdAt.toEpochMilli() + "_" + id;
        return Base64.getUrlEncoder().withoutPadding().encodeToString(raw.getBytes(StandardCharsets.UTF_8));
    }

    public static Cursor decode(String cursor) {
        if (cursor == null || cursor.isBlank()) {
            return null;
        }
        try {
            String raw = new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8);
            int split = raw.indexOf('_');
            if (split <= 0 || split == raw.length() - 1) {
                throw new ValidationFailedException("Cursor is invalid");
            }
            long epoch = Long.parseLong(raw.substring(0, split));
            String id = raw.substring(split + 1);
            Ids.require(id);
            return new Cursor(Instant.ofEpochMilli(epoch), id);
        } catch (ValidationFailedException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            throw new ValidationFailedException("Cursor is invalid");
        }
    }
}
