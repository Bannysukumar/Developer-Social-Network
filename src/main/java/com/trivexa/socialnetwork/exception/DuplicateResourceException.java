package com.trivexa.socialnetwork.exception;

import org.springframework.http.HttpStatus;

public class DuplicateResourceException extends ApiException {

    public DuplicateResourceException(String message) {
        super(ErrorCode.DUPLICATE_RESOURCE, HttpStatus.CONFLICT, message);
    }
}
