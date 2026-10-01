package com.devconnect.socialnetwork.exception;

import com.devconnect.socialnetwork.dto.ApiErrorResponse;
import com.devconnect.socialnetwork.dto.FieldErrorDetail;
import com.devconnect.socialnetwork.security.ErrorResponseWriter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.List;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    private final ErrorResponseWriter writer;

    public GlobalExceptionHandler(ErrorResponseWriter writer) {
        this.writer = writer;
    }

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ApiErrorResponse> handleApi(ApiException ex, HttpServletRequest request) {
        return respond(ex.getStatus(), ex.getErrorCode(), ex.getMessage(), request, List.of());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiErrorResponse> handleInvalid(MethodArgumentNotValidException ex, HttpServletRequest request) {
        List<FieldErrorDetail> details = ex.getBindingResult().getFieldErrors().stream()
                .map(error -> new FieldErrorDetail(error.getField(), error.getDefaultMessage()))
                .toList();
        return respond(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_ERROR, "Validation failed", request, details);
    }

    @ExceptionHandler(HandlerMethodValidationException.class)
    public ResponseEntity<ApiErrorResponse> handleMethodValidation(HandlerMethodValidationException ex, HttpServletRequest request) {
        List<FieldErrorDetail> details = ex.getParameterValidationResults().stream()
                .flatMap(result -> result.getResolvableErrors().stream()
                        .map(error -> new FieldErrorDetail(result.getMethodParameter().getParameterName(), error.getDefaultMessage())))
                .toList();
        return respond(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_ERROR, "Validation failed", request, details);
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ApiErrorResponse> handleConstraint(ConstraintViolationException ex, HttpServletRequest request) {
        List<FieldErrorDetail> details = ex.getConstraintViolations().stream()
                .map(violation -> new FieldErrorDetail(violation.getPropertyPath().toString(), violation.getMessage()))
                .toList();
        return respond(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_ERROR, "Validation failed", request, details);
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, HttpMediaTypeNotSupportedException.class})
    public ResponseEntity<ApiErrorResponse> handleMalformed(Exception ex, HttpServletRequest request) {
        return respond(HttpStatus.BAD_REQUEST, ErrorCode.MALFORMED_REQUEST, "Request body is malformed", request, List.of());
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ApiErrorResponse> handleMethod(HttpRequestMethodNotSupportedException ex, HttpServletRequest request) {
        return respond(HttpStatus.METHOD_NOT_ALLOWED, ErrorCode.MALFORMED_REQUEST, "Method is not allowed", request, List.of());
    }

    @ExceptionHandler({AccessDeniedException.class})
    public ResponseEntity<ApiErrorResponse> handleDenied(AccessDeniedException ex, HttpServletRequest request) {
        return respond(HttpStatus.FORBIDDEN, ErrorCode.ACCESS_DENIED, "Access is denied", request, List.of());
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiErrorResponse> handleMissing(NoResourceFoundException ex, HttpServletRequest request) {
        return respond(HttpStatus.NOT_FOUND, ErrorCode.RESOURCE_NOT_FOUND, "Resource not found", request, List.of());
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ApiErrorResponse> handleUpload(MaxUploadSizeExceededException ex, HttpServletRequest request) {
        return respond(HttpStatus.PAYLOAD_TOO_LARGE, ErrorCode.PAYLOAD_TOO_LARGE, "Upload exceeds the size limit", request, List.of());
    }

    @ExceptionHandler(DuplicateKeyException.class)
    public ResponseEntity<ApiErrorResponse> handleDuplicate(DuplicateKeyException ex, HttpServletRequest request) {
        log.warn("Duplicate key while handling {}", request.getRequestURI());
        return respond(HttpStatus.CONFLICT, ErrorCode.DUPLICATE_RESOURCE, "The resource already exists", request, List.of());
    }

    @ExceptionHandler(DataAccessException.class)
    public ResponseEntity<ApiErrorResponse> handleData(DataAccessException ex, HttpServletRequest request) {
        log.error("Database error type={}", ex.getClass().getSimpleName());
        return respond(HttpStatus.INTERNAL_SERVER_ERROR, ErrorCode.DATABASE_ERROR,
                "The request could not be completed", request, List.of());
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiErrorResponse> handleGeneric(Exception ex, HttpServletRequest request) {
        log.error("Unhandled error type={}", ex.getClass().getSimpleName(), ex);
        return respond(HttpStatus.INTERNAL_SERVER_ERROR, ErrorCode.INTERNAL_ERROR,
                "An unexpected error occurred", request, List.of());
    }

    private ResponseEntity<ApiErrorResponse> respond(
            HttpStatus status,
            ErrorCode code,
            String message,
            HttpServletRequest request,
            List<FieldErrorDetail> details
    ) {
        return ResponseEntity.status(status).body(writer.body(code, message, request.getRequestURI(), details));
    }
}
