package com.trivexa.socialnetwork.dto.request;

import com.trivexa.socialnetwork.validation.PasswordConstraint;
import jakarta.validation.constraints.NotBlank;

public record ResetPasswordRequest(
        @NotBlank String token,
        @NotBlank @PasswordConstraint String newPassword
) {
}
