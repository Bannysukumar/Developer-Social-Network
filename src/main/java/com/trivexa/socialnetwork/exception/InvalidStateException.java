package com.trivexa.socialnetwork.exception;

import org.springframework.http.HttpStatus;

public class InvalidStateException extends ApiException {

    public InvalidStateException(String message) {
        super(ErrorCode.INVALID_STATE, HttpStatus.CONFLICT, message);
    }
}
