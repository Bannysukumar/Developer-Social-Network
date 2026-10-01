package com.devconnect.socialnetwork.security;

import com.devconnect.socialnetwork.config.AppProperties;
import com.devconnect.socialnetwork.exception.ErrorCode;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;

@Component
public class RateLimitFilter extends OncePerRequestFilter {

    private final AppProperties properties;
    private final RateLimiter rateLimiter;
    private final ErrorResponseWriter errorResponseWriter;

    public RateLimitFilter(AppProperties properties, RateLimiter rateLimiter, ErrorResponseWriter errorResponseWriter) {
        this.properties = properties;
        this.rateLimiter = rateLimiter;
        this.errorResponseWriter = errorResponseWriter;
    }

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain
    ) throws ServletException, IOException {
        if (!properties.getRateLimit().isEnabled() || HttpMethod.OPTIONS.matches(request.getMethod())) {
            filterChain.doFilter(request, response);
            return;
        }
        Rule rule = match(request);
        if (rule == null) {
            filterChain.doFilter(request, response);
            return;
        }
        boolean allowed;
        try {
            allowed = rateLimiter.tryAcquire(rule.key(), rule.limit(), rule.window());
        } catch (RuntimeException ex) {
            errorResponseWriter.write(response, HttpStatus.SERVICE_UNAVAILABLE, ErrorCode.RATE_LIMITED,
                    "Rate limit store is unavailable", request.getRequestURI());
            return;
        }
        if (!allowed) {
            response.setHeader("Retry-After", String.valueOf(rule.window().toSeconds()));
            errorResponseWriter.write(response, HttpStatus.TOO_MANY_REQUESTS, ErrorCode.RATE_LIMITED,
                    "Too many requests", request.getRequestURI());
            return;
        }
        filterChain.doFilter(request, response);
    }

    private Rule match(HttpServletRequest request) {
        String path = request.getRequestURI();
        String method = request.getMethod();
        String ip = SecurityUtils.clientIp(request, properties.getSecurity().isTrustProxy());
        String user = currentUserOrIp(ip);
        AppProperties.RateLimit limits = properties.getRateLimit();
        if (HttpMethod.POST.matches(method) && "/api/v1/auth/signup".equals(path)) {
            return new Rule("signup:" + ip, limits.getSignupPerHour(), Duration.ofHours(1));
        }
        if (HttpMethod.POST.matches(method) && "/api/v1/auth/login".equals(path)) {
            return new Rule("login:" + ip, limits.getLoginPerFifteenMinutes(), Duration.ofMinutes(15));
        }
        if (HttpMethod.POST.matches(method) && "/api/v1/auth/forgot-password".equals(path)) {
            return new Rule("forgot:" + ip, limits.getForgotPasswordPerHour(), Duration.ofHours(1));
        }
        if (HttpMethod.POST.matches(method) && "/api/v1/auth/reset-password".equals(path)) {
            return new Rule("reset:" + ip, limits.getResetPasswordPerHour(), Duration.ofHours(1));
        }
        if (HttpMethod.POST.matches(method) && "/api/v1/auth/verify-email".equals(path)) {
            return new Rule("verify:" + ip, limits.getVerifyEmailPerHour(), Duration.ofHours(1));
        }
        if (HttpMethod.POST.matches(method) && "/api/v1/auth/resend-verification".equals(path)) {
            return new Rule("resend:" + user, limits.getResendVerificationPerHour(), Duration.ofHours(1));
        }
        if (HttpMethod.GET.matches(method) && "/api/v1/users/search".equals(path)) {
            return new Rule("search:" + user, limits.getSearchPerMinute(), Duration.ofMinutes(1));
        }
        if (HttpMethod.POST.matches(method) && path.startsWith("/api/v1/friend-requests/")) {
            return new Rule("friend:" + user, limits.getFriendRequestPerHour(), Duration.ofHours(1));
        }
        if (HttpMethod.POST.matches(method) && path.startsWith("/api/v1/conversations/") && path.endsWith("/messages")) {
            return new Rule("message:" + user, limits.getMessagePerMinute(), Duration.ofMinutes(1));
        }
        return null;
    }

    private String currentUserOrIp(String ip) {
        var authentication = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof AuthenticatedUser user) {
            return user.id();
        }
        return ip;
    }

    private record Rule(String key, int limit, Duration window) {
    }
}
