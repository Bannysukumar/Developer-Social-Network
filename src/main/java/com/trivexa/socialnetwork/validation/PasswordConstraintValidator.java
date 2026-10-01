package com.trivexa.socialnetwork.validation;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

import java.util.Locale;
import java.util.Set;

public class PasswordConstraintValidator implements ConstraintValidator<PasswordConstraint, String> {

    private static final Set<String> DENIED = Set.of(
            "password123", "password1234", "1234567890", "qwertyuiop", "changeme123", "letmein123"
    );

    @Override
    public boolean isValid(String value, ConstraintValidatorContext context) {
        if (value == null || value.isBlank()) {
            return false;
        }
        if (value.length() < 10 || value.length() > 128) {
            return false;
        }
        if (value.chars().anyMatch(Character::isWhitespace)) {
            return false;
        }
        boolean letter = value.chars().anyMatch(Character::isLetter);
        boolean digit = value.chars().anyMatch(Character::isDigit);
        if (!letter || !digit) {
            return false;
        }
        return !DENIED.contains(value.toLowerCase(Locale.ROOT));
    }
}
