package com.trivexa.socialnetwork.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration
public class PasswordEncoderConfig {

    @Bean
    public PasswordEncoder passwordEncoder(AppProperties properties) {
        AppProperties.Password password = properties.getPassword();
        return new Argon2PasswordEncoder(
                password.getSaltLength(),
                password.getHashLength(),
                password.getParallelism(),
                password.getMemoryKb(),
                password.getIterations()
        );
    }
}
