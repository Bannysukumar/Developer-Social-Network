package com.trivexa.socialnetwork.exception;

import org.springframework.http.HttpStatus;

public class UnauthorizedException extends ApiException {

    public UnauthorizedException(String message) {
        super(ErrorCode.AUTHENTICATION_ERROR, HttpStatus.UNAUTHORIZED, message);
    }
}
