package com.devconnect.socialnetwork.config;

import com.devconnect.socialnetwork.notification.EmailSender;
import com.devconnect.socialnetwork.notification.LoggingEmailSender;
import com.devconnect.socialnetwork.notification.SmtpEmailSender;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.mail.javamail.JavaMailSenderImpl;

import java.util.Properties;

@Configuration
public class MailConfig {

    @Bean
    public EmailSender emailSender(AppProperties properties) {
        if (!properties.getMail().isConfigured()) {
            return new LoggingEmailSender();
        }
        JavaMailSenderImpl sender = new JavaMailSenderImpl();
        sender.setHost(properties.getMail().getHost());
        sender.setPort(properties.getMail().getPort());
        sender.setUsername(properties.getMail().getUsername());
        sender.setPassword(properties.getMail().getPassword());
        Properties mailProperties = sender.getJavaMailProperties();
        mailProperties.put("mail.smtp.auth", Boolean.toString(properties.getMail().isSmtpAuth()));
        mailProperties.put("mail.smtp.starttls.enable", Boolean.toString(properties.getMail().isStarttls()));
        return new SmtpEmailSender(sender, properties.getMail().getFrom());
    }
}
