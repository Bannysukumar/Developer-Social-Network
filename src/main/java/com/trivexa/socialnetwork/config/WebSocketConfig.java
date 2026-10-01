package com.trivexa.socialnetwork.config;

import com.trivexa.socialnetwork.websocket.ChatWebSocketHandler;
import com.trivexa.socialnetwork.websocket.JwtHandshakeInterceptor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;
import org.springframework.web.socket.server.standard.ServletServerContainerFactoryBean;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final ChatWebSocketHandler chatWebSocketHandler;
    private final JwtHandshakeInterceptor jwtHandshakeInterceptor;
    private final AppProperties properties;

    public WebSocketConfig(
            ChatWebSocketHandler chatWebSocketHandler,
            JwtHandshakeInterceptor jwtHandshakeInterceptor,
            AppProperties properties
    ) {
        this.chatWebSocketHandler = chatWebSocketHandler;
        this.jwtHandshakeInterceptor = jwtHandshakeInterceptor;
        this.properties = properties;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        String[] origins = properties.getCors().originList().toArray(String[]::new);
        registry.addHandler(chatWebSocketHandler, "/ws/chat")
                .addInterceptors(jwtHandshakeInterceptor)
                .setAllowedOrigins(origins);
    }

    @Bean
    @ConditionalOnProperty(name = "app.websocket.container-limits", havingValue = "true", matchIfMissing = true)
    public ServletServerContainerFactoryBean webSocketContainer() {
        ServletServerContainerFactoryBean container = new ServletServerContainerFactoryBean();
        container.setMaxTextMessageBufferSize(65_536);
        container.setMaxSessionIdleTimeout(30L * 60L * 1000L);
        return container;
    }
}
