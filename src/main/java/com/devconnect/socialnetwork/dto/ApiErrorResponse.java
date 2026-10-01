package com.devconnect.socialnetwork.dto;

import java.time.Instant;
import java.util.List;

public class ApiErrorResponse {

    private final boolean success = false;
    private final String message;
    private final String errorCode;
    private final Instant timestamp;
    private final String path;
    private final List<FieldErrorDetail> details;

    public ApiErrorResponse(String message, String errorCode, Instant timestamp, String path, List<FieldErrorDetail> details) {
        this.message = message;
        this.errorCode = errorCode;
        this.timestamp = timestamp;
        this.path = path;
        this.details = details;
    }

    public boolean isSuccess() {
        return success;
    }

    public String getMessage() {
        return message;
    }

    public String getErrorCode() {
        return errorCode;
    }

    public Instant getTimestamp() {
        return timestamp;
    }

    public String getPath() {
        return path;
    }

    public List<FieldErrorDetail> getDetails() {
        return details;
    }
}
