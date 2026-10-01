package com.trivexa.socialnetwork.websocket;

import com.trivexa.socialnetwork.exception.ApiException;
import com.trivexa.socialnetwork.security.AccessTokenAuthenticator;
import com.trivexa.socialnetwork.security.AuthenticatedUser;
import com.trivexa.socialnetwork.security.SecurityUtils;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.http.server.ServletServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.util.Map;

@Component
public class JwtHandshakeInterceptor implements HandshakeInterceptor {

    private final AccessTokenAuthenticator authenticator;

    public JwtHandshakeInterceptor(AccessTokenAuthenticator authenticator) {
        this.authenticator = authenticator;
    }

    @Override
    public boolean beforeHandshake(
            ServerHttpRequest request,
            ServerHttpResponse response,
            WebSocketHandler wsHandler,
            Map<String, Object> attributes
    ) {
        if (!(request instanceof ServletServerHttpRequest servletRequest)) {
            reject(response);
            return false;
        }
        HttpServletRequest http = servletRequest.getServletRequest();
        String token = SecurityUtils.bearerToken(http);
        if (token == null) {
            String queryToken = http.getParameter("access_token");
            if (queryToken != null && !queryToken.isBlank()) {
                token = queryToken.trim();
            }
        }
        if (token == null) {
            reject(response);
            return false;
        }
        try {
            AuthenticatedUser user = authenticator.authenticate(token);
            attributes.put("userId", user.id());
            return true;
        } catch (ApiException ex) {
            reject(response);
            return false;
        }
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response, WebSocketHandler wsHandler, Exception exception) {
        // No token or claim material is logged.
    }

    private void reject(ServerHttpResponse response) {
        if (response instanceof ServletServerHttpResponse servletResponse) {
            servletResponse.setStatusCode(HttpStatus.UNAUTHORIZED);
        }
    }
}
