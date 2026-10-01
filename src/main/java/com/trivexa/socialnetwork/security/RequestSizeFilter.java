package com.trivexa.socialnetwork.security;

import com.trivexa.socialnetwork.config.AppProperties;
import com.trivexa.socialnetwork.exception.ErrorCode;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 1)
public class RequestSizeFilter extends OncePerRequestFilter {

    private final AppProperties properties;
    private final ErrorResponseWriter errorResponseWriter;

    public RequestSizeFilter(AppProperties properties, ErrorResponseWriter errorResponseWriter) {
        this.properties = properties;
        this.errorResponseWriter = errorResponseWriter;
    }

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain
    ) throws ServletException, IOException {
        long length = request.getContentLengthLong();
        if (length > properties.getSecurity().getMaxRequestBytes()) {
            errorResponseWriter.write(
                    response,
                    HttpStatus.PAYLOAD_TOO_LARGE,
                    ErrorCode.PAYLOAD_TOO_LARGE,
                    "Request body is too large",
                    request.getRequestURI()
            );
            return;
        }
        filterChain.doFilter(request, response);
    }
}
