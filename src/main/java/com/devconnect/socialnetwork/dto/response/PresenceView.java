package com.devconnect.socialnetwork.dto.response;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.Instant;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record PresenceView(String status, Instant lastSeenAt) {
}
