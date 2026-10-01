package com.trivexa.socialnetwork.crypto;

import com.trivexa.socialnetwork.exception.ValidationFailedException;

import java.util.Base64;

public final class CiphertextValidator {

    public static final int MAX_CIPHERTEXT_CHARS = 65_536;
    public static final int MAX_CIPHERTEXT_BYTES = 48_000;

    private CiphertextValidator() {
    }

    public static String require(String ciphertext) {
        if (ciphertext == null || ciphertext.isBlank()) {
            throw new ValidationFailedException("Ciphertext is required");
        }
        String trimmed = ciphertext.trim();
        if (trimmed.length() > MAX_CIPHERTEXT_CHARS) {
            throw new ValidationFailedException("Ciphertext exceeds the maximum size");
        }
        byte[] decoded;
        try {
            decoded = Base64.getDecoder().decode(trimmed);
        } catch (IllegalArgumentException ex) {
            throw new ValidationFailedException("Ciphertext must be standard Base64");
        }
        if (decoded.length == 0 || decoded.length > MAX_CIPHERTEXT_BYTES) {
            throw new ValidationFailedException("Ciphertext exceeds the maximum size");
        }
        return trimmed;
    }
}
