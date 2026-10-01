package com.trivexa.socialnetwork.dto;

public record WriteResult<T>(T body, boolean created) {
}
