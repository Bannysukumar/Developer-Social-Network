package com.devconnect.socialnetwork.dto.request;

import com.devconnect.socialnetwork.domain.AccountType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ReplaceProfileRequest(
        @NotBlank @Size(min = 1, max = 50) String displayName,
        @Size(max = 500) String bio,
        @NotNull AccountType accountType,
        Boolean clearProfileImage
) {
}
