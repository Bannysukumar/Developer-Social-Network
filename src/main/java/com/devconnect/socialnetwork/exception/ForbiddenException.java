package com.devconnect.socialnetwork.exception;

import org.springframework.http.HttpStatus;

public class ForbiddenException extends ApiException {

    public ForbiddenException(String message) {
        super(ErrorCode.ACCESS_DENIED, HttpStatus.FORBIDDEN, message);
    }
}
