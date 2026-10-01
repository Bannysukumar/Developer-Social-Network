package com.devconnect.socialnetwork.config;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

@Component
@Profile("prod")
public class ProductionSecurityValidator implements ApplicationRunner {

    private final AppProperties properties;

    public ProductionSecurityValidator(AppProperties properties) {
        this.properties = properties;
    }

    @Override
    public void run(ApplicationArguments args) {
        List<String> problems = new ArrayList<>();
        String secret = properties.getJwt().getSecret() == null ? "" : properties.getJwt().getSecret();
        if (secret.getBytes(StandardCharsets.UTF_8).length < 32) {
            problems.add("JWT_SECRET must be at least 32 bytes");
        }
        String lowered = secret.toLowerCase(Locale.ROOT);
        if (lowered.contains("change-me") || lowered.contains("dev-only") || lowered.contains("replace-with")) {
            problems.add("JWT_SECRET is still an example value");
        }
        List<String> origins = properties.getCors().originList();
        if (origins.isEmpty() || origins.stream().anyMatch(origin -> "*".equals(origin))) {
            problems.add("CORS_ALLOWED_ORIGINS must list explicit origins and must not contain *");
        }
        String mongoUri = System.getenv().getOrDefault("MONGODB_URI", "");
        if (!mongoUri.contains("@")) {
            problems.add("MONGODB_URI must include authentication credentials");
        }
        if (!problems.isEmpty()) {
            throw new IllegalStateException("Production configuration is unsafe: " + String.join("; ", problems));
        }
    }
}
