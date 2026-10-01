package com.devconnect.socialnetwork.security;

import com.devconnect.socialnetwork.domain.Role;
import com.devconnect.socialnetwork.exception.ApiException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.http.HttpMethod;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Set;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final Set<String> PUBLIC_POSTS = Set.of(
            "/api/v1/auth/signup",
            "/api/v1/auth/login",
            "/api/v1/auth/refresh",
            "/api/v1/auth/forgot-password",
            "/api/v1/auth/reset-password",
            "/api/v1/auth/verify-email"
    );

    private final AccessTokenAuthenticator authenticator;
    private final ErrorResponseWriter errorResponseWriter;

    public JwtAuthenticationFilter(AccessTokenAuthenticator authenticator, ErrorResponseWriter errorResponseWriter) {
        this.authenticator = authenticator;
        this.errorResponseWriter = errorResponseWriter;
    }

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain
    ) throws ServletException, IOException {
        if (isPublic(request) || "OPTIONS".equalsIgnoreCase(request.getMethod())) {
            filterChain.doFilter(request, response);
            return;
        }
        String token = resolveToken(request);
        if (token == null) {
            filterChain.doFilter(request, response);
            return;
        }
        try {
            AuthenticatedUser user = authenticator.authenticate(token);
            var authorities = user.roles().stream()
                    .map(Role::name)
                    .map(role -> new SimpleGrantedAuthority("ROLE_" + role))
                    .toList();
            var authentication = new UsernamePasswordAuthenticationToken(user, null, authorities);
            SecurityContextHolder.getContext().setAuthentication(authentication);
            MDC.put("userId", user.id());
            filterChain.doFilter(request, response);
        } catch (ApiException ex) {
            SecurityContextHolder.clearContext();
            errorResponseWriter.write(response, ex.getStatus(), ex.getErrorCode(), ex.getMessage(), request.getRequestURI());
        }
    }

    private boolean isPublic(HttpServletRequest request) {
        String path = request.getRequestURI();
        if (HttpMethod.POST.matches(request.getMethod()) && PUBLIC_POSTS.contains(path)) {
            return true;
        }
        return path.startsWith("/actuator/health")
                || path.startsWith("/v3/api-docs")
                || path.startsWith("/swagger-ui")
                || path.equals("/swagger-ui.html");
    }

    private String resolveToken(HttpServletRequest request) {
        if (request.getRequestURI().startsWith("/ws/")) {
            String queryToken = request.getParameter("access_token");
            if (queryToken != null && !queryToken.isBlank()) {
                return queryToken.trim();
            }
        }
        return SecurityUtils.bearerToken(request);
    }
}
