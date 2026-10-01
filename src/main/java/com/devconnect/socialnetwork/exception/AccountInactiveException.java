package com.devconnect.socialnetwork.exception;

import org.springframework.http.HttpStatus;

public class AccountInactiveException extends ApiException {

    public AccountInactiveException(String message) {
        super(ErrorCode.ACCOUNT_INACTIVE, HttpStatus.FORBIDDEN, message);
    }
}
