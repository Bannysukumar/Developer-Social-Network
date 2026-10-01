package com.devconnect.socialnetwork.exception;

import org.springframework.http.HttpStatus;

public class ValidationFailedException extends ApiException {

    public ValidationFailedException(String message) {
        super(ErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, message);
    }
}
