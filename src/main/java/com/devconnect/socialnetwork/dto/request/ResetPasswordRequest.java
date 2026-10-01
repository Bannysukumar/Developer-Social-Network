package com.devconnect.socialnetwork.dto.request;

import com.devconnect.socialnetwork.validation.PasswordConstraint;
import jakarta.validation.constraints.NotBlank;

public record ResetPasswordRequest(
        @NotBlank String token,
        @NotBlank @PasswordConstraint String newPassword
) {
}
