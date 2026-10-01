package com.trivexa.socialnetwork.dto.request;

import com.trivexa.socialnetwork.validation.PasswordConstraint;
import jakarta.validation.constraints.NotBlank;

public record ChangePasswordRequest(
        @NotBlank String currentPassword,
        @NotBlank @PasswordConstraint String newPassword
) {
}
