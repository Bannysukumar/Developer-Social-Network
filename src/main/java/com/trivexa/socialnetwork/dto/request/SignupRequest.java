package com.trivexa.socialnetwork.dto.request;

import com.trivexa.socialnetwork.util.TextNormalizer;
import com.trivexa.socialnetwork.validation.PasswordConstraint;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record SignupRequest(
        @NotBlank
        @Size(min = 3, max = 30)
        @Pattern(regexp = "^(?!.*[.]{2})(?!.*_{2})[A-Za-z0-9](?:[A-Za-z0-9._]{1,28}[A-Za-z0-9])$",
                message = "Username may contain letters, digits, dots, and underscores")
        String username,
        @NotBlank
        @Email
        @Size(max = 254)
        String email,
        @NotBlank
        @PasswordConstraint
        String password,
        @NotBlank
        @Size(min = 1, max = 50)
        String displayName
) {
    public String normalizedUsername() {
        return TextNormalizer.username(username);
    }
}
