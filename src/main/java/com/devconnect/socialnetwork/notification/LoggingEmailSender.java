package com.devconnect.socialnetwork.notification;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class LoggingEmailSender implements EmailSender {

    private static final Logger log = LoggerFactory.getLogger(LoggingEmailSender.class);

    @Override
    public void send(String to, String subject, String text) {
        log.info("Email delivery skipped because SMTP is not configured. subject={}", subject);
    }
}
