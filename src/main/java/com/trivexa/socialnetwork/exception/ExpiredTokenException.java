package com.trivexa.socialnetwork.exception;

import org.springframework.http.HttpStatus;

public class ExpiredTokenException extends ApiException {

    public ExpiredTokenException(String message) {
        super(ErrorCode.EXPIRED_TOKEN, HttpStatus.UNAUTHORIZED, message);
    }
}
