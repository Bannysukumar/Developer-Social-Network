package com.devconnect.socialnetwork.util;

import com.devconnect.socialnetwork.exception.ValidationFailedException;

import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

public final class TextNormalizer {

    public static final Pattern USERNAME = Pattern.compile(
            "^(?!.*[.]{2})(?!.*_{2})[A-Za-z0-9](?:[A-Za-z0-9._]{1,28}[A-Za-z0-9])$");

    private static final Set<String> RESERVED = Set.of(
            "admin", "administrator", "system", "support", "root", "api", "null", "undefined", "moderator"
    );

    private TextNormalizer() {
    }

    public static String username(String value) {
        if (value == null) {
            throw new ValidationFailedException("Username is required");
        }
        String normalized = value.trim().toLowerCase(Locale.ROOT);
        if (!USERNAME.matcher(value.trim()).matches()) {
            throw new ValidationFailedException("Username format is invalid");
        }
        if (RESERVED.contains(normalized)) {
            throw new ValidationFailedException("Username is not available");
        }
        return normalized;
    }

    public static String email(String value) {
        if (value == null) {
            throw new ValidationFailedException("Email is required");
        }
        return value.trim().toLowerCase(Locale.ROOT);
    }

    public static String displayName(String value) {
        String cleaned = sanitize(value, false);
        if (cleaned.isBlank() || cleaned.length() > 50) {
            throw new ValidationFailedException("Display name must be between 1 and 50 characters");
        }
        return cleaned;
    }

    public static String displayNameKey(String displayName) {
        return displayName.trim().toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
    }

    public static String bio(String value) {
        if (value == null) {
            return "";
        }
        String cleaned = sanitize(value, true);
        if (cleaned.length() > 500) {
            throw new ValidationFailedException("Bio must be at most 500 characters");
        }
        return cleaned;
    }

    public static String searchQuery(String value) {
        if (value == null) {
            throw new ValidationFailedException("Search query is required");
        }
        String trimmed = value.trim().toLowerCase(Locale.ROOT);
        if (trimmed.length() < 2 || trimmed.length() > 50) {
            throw new ValidationFailedException("Search query must be between 2 and 50 characters");
        }
        if (trimmed.indexOf('$') >= 0 || trimmed.indexOf('\0') >= 0) {
            throw new ValidationFailedException("Search query contains unsupported characters");
        }
        return trimmed;
    }

    private static String sanitize(String value, boolean allowNewlines) {
        StringBuilder builder = new StringBuilder(value.length());
        boolean previousNewline = false;
        for (int i = 0; i < value.length(); i++) {
            char ch = value.charAt(i);
            if (ch == '<' || ch == '>') {
                continue;
            }
            if (ch == '\n' && allowNewlines) {
                if (!previousNewline) {
                    builder.append(ch);
                }
                previousNewline = true;
                continue;
            }
            if (ch == '\t' || ch == '\r') {
                builder.append(' ');
                previousNewline = false;
                continue;
            }
            if (Character.isISOControl(ch)) {
                continue;
            }
            builder.append(ch);
            previousNewline = false;
        }
        return builder.toString().trim();
    }
}
