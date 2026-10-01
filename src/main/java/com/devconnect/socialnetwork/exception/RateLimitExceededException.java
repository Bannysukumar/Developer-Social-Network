package com.devconnect.socialnetwork.exception;

import org.springframework.http.HttpStatus;

public class RateLimitExceededException extends ApiException {

    public RateLimitExceededException(String message) {
        super(ErrorCode.RATE_LIMITED, HttpStatus.TOO_MANY_REQUESTS, message);
    }
}
