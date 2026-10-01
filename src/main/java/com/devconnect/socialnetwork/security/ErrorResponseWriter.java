package com.devconnect.socialnetwork.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.devconnect.socialnetwork.dto.ApiErrorResponse;
import com.devconnect.socialnetwork.dto.FieldErrorDetail;
import com.devconnect.socialnetwork.exception.ErrorCode;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;

@Component
public class ErrorResponseWriter {

    private final ObjectMapper objectMapper;

    public ErrorResponseWriter(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public void write(HttpServletResponse response, HttpStatus status, ErrorCode code, String message, String path) throws IOException {
        if (response.isCommitted()) {
            return;
        }
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        ApiErrorResponse body = new ApiErrorResponse(message, code.name(), Instant.now(), path, List.of());
        objectMapper.writeValue(response.getOutputStream(), body);
    }

    public ApiErrorResponse body(ErrorCode code, String message, String path, List<FieldErrorDetail> details) {
        return new ApiErrorResponse(message, code.name(), Instant.now(), path, details == null ? List.of() : details);
    }
}
