package com.trivexa.socialnetwork.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record LoginRequest(
        @NotBlank @Size(max = 254) String usernameOrEmail,
        @NotBlank @Size(max = 128) String password,
        @Valid DeviceContextRequest device
) {
}
