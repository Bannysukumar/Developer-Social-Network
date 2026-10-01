package com.trivexa.socialnetwork.domain;

public enum AuditEventType {
    LOGIN,
    LOGOUT,
    PASSWORD_CHANGED,
    PASSWORD_RESET,
    EMAIL_VERIFIED,
    DEVICE_ADDED,
    DEVICE_REVOKED,
    ACCOUNT_DELETED,
    USER_BLOCKED,
    USER_UNBLOCKED
}
