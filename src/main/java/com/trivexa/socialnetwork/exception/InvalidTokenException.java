package com.trivexa.socialnetwork.exception;

import org.springframework.http.HttpStatus;

public class InvalidTokenException extends ApiException {

    public InvalidTokenException(String message) {
        super(ErrorCode.INVALID_TOKEN, HttpStatus.UNAUTHORIZED, message);
    }
}
