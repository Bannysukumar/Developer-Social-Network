package com.devconnect.socialnetwork.dto;

public record WriteResult<T>(T body, boolean created) {
}
