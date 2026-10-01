package com.trivexa.socialnetwork.crypto;

import com.trivexa.socialnetwork.exception.ValidationFailedException;

import java.util.Base64;

public final class PublicKeyMaterial {

    public static final int PUBLIC_KEY_BYTES = 32;
    public static final int SIGNATURE_BYTES = 64;

    private PublicKeyMaterial() {
    }

    public static String requirePublicKey(String value) {
        return requireBase64(value, PUBLIC_KEY_BYTES, "Public key");
    }

    public static String requireSignature(String value) {
        return requireBase64(value, SIGNATURE_BYTES, "Signature");
    }

    private static String requireBase64(String value, int expectedBytes, String label) {
        if (value == null || value.isBlank()) {
            throw new ValidationFailedException(label + " is required");
        }
        byte[] decoded;
        try {
            decoded = Base64.getDecoder().decode(value.trim());
        } catch (IllegalArgumentException ex) {
            throw new ValidationFailedException(label + " must be standard Base64");
        }
        if (decoded.length != expectedBytes) {
            throw new ValidationFailedException(label + " has an unexpected length");
        }
        return value.trim();
    }
}
