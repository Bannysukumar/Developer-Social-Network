package com.devconnect.socialnetwork.notification;

public interface EmailSender {

    void send(String to, String subject, String text);
}
