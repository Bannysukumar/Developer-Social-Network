package com.trivexa.socialnetwork.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI socialNetworkOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("Trivexa Social Network API")
                        .version("v1")
                        .description("""
                                Versioned REST API for the Trivexa social network.
                                Message bodies are client-encrypted ciphertext. The server stores and forwards ciphertext and public key material only.
                                Private keys are never accepted. This API does not implement message encryption itself.
                                """))
                .addSecurityItem(new SecurityRequirement().addList("bearer-jwt"))
                .components(new Components().addSecuritySchemes("bearer-jwt",
                        new SecurityScheme()
                                .name("bearer-jwt")
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("JWT")));
    }
}
