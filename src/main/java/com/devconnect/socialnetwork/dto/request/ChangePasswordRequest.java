package com.devconnect.socialnetwork.dto.request;

import com.devconnect.socialnetwork.validation.PasswordConstraint;
import jakarta.validation.constraints.NotBlank;

public record ChangePasswordRequest(
        @NotBlank String currentPassword,
        @NotBlank @PasswordConstraint String newPassword
) {
}
