package com.devconnect.socialnetwork.exception;

import org.springframework.http.HttpStatus;

public class PayloadTooLargeException extends ApiException {

    public PayloadTooLargeException(String message) {
        super(ErrorCode.PAYLOAD_TOO_LARGE, HttpStatus.PAYLOAD_TOO_LARGE, message);
    }
}
