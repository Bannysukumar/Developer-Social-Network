package com.devconnect.socialnetwork.dto.request;

import com.devconnect.socialnetwork.domain.AccountType;
import jakarta.validation.constraints.Size;

public record UpdateProfileRequest(
        @Size(min = 1, max = 50) String displayName,
        @Size(max = 500) String bio,
        AccountType accountType,
        Boolean clearProfileImage,
        Boolean showActivityStatus
) {
}
