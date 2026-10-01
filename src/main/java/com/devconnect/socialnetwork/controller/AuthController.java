package com.devconnect.socialnetwork.controller;

import com.devconnect.socialnetwork.dto.ApiResponse;
import com.devconnect.socialnetwork.dto.request.ChangePasswordRequest;
import com.devconnect.socialnetwork.dto.request.ForgotPasswordRequest;
import com.devconnect.socialnetwork.dto.request.LoginRequest;
import com.devconnect.socialnetwork.dto.request.LogoutRequest;
import com.devconnect.socialnetwork.dto.request.RefreshTokenRequest;
import com.devconnect.socialnetwork.dto.request.ResetPasswordRequest;
import com.devconnect.socialnetwork.dto.request.SignupRequest;
import com.devconnect.socialnetwork.dto.request.VerifyEmailRequest;
import com.devconnect.socialnetwork.dto.response.AuthResponse;
import com.devconnect.socialnetwork.security.SecurityUtils;
import com.devconnect.socialnetwork.service.AuthService;
import com.devconnect.socialnetwork.service.EmailVerificationService;
import com.devconnect.socialnetwork.service.PasswordResetService;
import com.devconnect.socialnetwork.util.ApiResponses;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
@Tag(name = "Authentication")
public class AuthController {

    private final AuthService authService;
    private final EmailVerificationService emailVerificationService;
    private final PasswordResetService passwordResetService;

    public AuthController(
            AuthService authService,
            EmailVerificationService emailVerificationService,
            PasswordResetService passwordResetService
    ) {
        this.authService = authService;
        this.emailVerificationService = emailVerificationService;
        this.passwordResetService = passwordResetService;
    }

    @PostMapping("/signup")
    @SecurityRequirements
    @Operation(summary = "Create an account and issue tokens")
    public ResponseEntity<ApiResponse<AuthResponse>> signup(@Valid @RequestBody SignupRequest request) {
        return ApiResponses.created("Account created", authService.signup(request));
    }

    @PostMapping("/login")
    @SecurityRequirements
    @Operation(summary = "Log in with a username or email and password")
    public ResponseEntity<ApiResponse<AuthResponse>> login(@Valid @RequestBody LoginRequest request) {
        return ApiResponses.ok("Login successful", authService.login(request));
    }

    @PostMapping("/refresh")
    @SecurityRequirements
    @Operation(summary = "Rotate a refresh token and issue a new access token")
    public ResponseEntity<ApiResponse<AuthResponse>> refresh(@Valid @RequestBody RefreshTokenRequest request) {
        return ApiResponses.ok("Token refreshed", authService.refresh(request.refreshToken()));
    }

    @PostMapping("/logout")
    @Operation(summary = "Revoke the presented refresh token and current access token")
    public ResponseEntity<ApiResponse<Void>> logout(@Valid @RequestBody LogoutRequest request, HttpServletRequest http) {
        authService.logout(SecurityUtils.currentUserId(), request.refreshToken(), SecurityUtils.bearerToken(http));
        return ApiResponses.ok("Logged out", null);
    }

    @PostMapping("/change-password")
    @Operation(summary = "Change the current password and revoke existing sessions")
    public ResponseEntity<ApiResponse<Void>> changePassword(@Valid @RequestBody ChangePasswordRequest request) {
        authService.changePassword(SecurityUtils.currentUserId(), request);
        return ApiResponses.ok("Password changed. Sign in again.", null);
    }

    @PostMapping("/forgot-password")
    @SecurityRequirements
    @Operation(summary = "Request a password reset without revealing whether the email exists")
    public ResponseEntity<ApiResponse<Void>> forgotPassword(@Valid @RequestBody ForgotPasswordRequest request) {
        passwordResetService.request(request.email());
        return ApiResponses.ok(PasswordResetService.GENERIC_MESSAGE, null);
    }

    @PostMapping("/reset-password")
    @SecurityRequirements
    @Operation(summary = "Reset a password with a single-use token")
    public ResponseEntity<ApiResponse<Void>> resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        passwordResetService.reset(request.token(), request.newPassword());
        return ApiResponses.ok("Password has been reset", null);
    }

    @PostMapping("/verify-email")
    @SecurityRequirements
    @Operation(summary = "Verify an email address with a single-use token")
    public ResponseEntity<ApiResponse<Void>> verifyEmail(@Valid @RequestBody VerifyEmailRequest request) {
        emailVerificationService.verify(request.token());
        return ApiResponses.ok("Email verified", null);
    }

    @PostMapping("/resend-verification")
    @Operation(summary = "Send another email verification token to the authenticated user")
    public ResponseEntity<ApiResponse<Void>> resendVerification() {
        emailVerificationService.resend(SecurityUtils.currentUserId());
        return ApiResponses.ok("If the email is unverified, a new token has been sent", null);
    }
}
