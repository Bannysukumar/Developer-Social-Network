package com.devconnect.socialnetwork.service;

import com.devconnect.socialnetwork.config.AppProperties;
import com.devconnect.socialnetwork.crypto.TokenHasher;
import com.devconnect.socialnetwork.domain.AccountStatus;
import com.devconnect.socialnetwork.domain.AccountType;
import com.devconnect.socialnetwork.domain.AuditEventType;
import com.devconnect.socialnetwork.domain.NotificationType;
import com.devconnect.socialnetwork.domain.Role;
import com.devconnect.socialnetwork.dto.request.ChangePasswordRequest;
import com.devconnect.socialnetwork.dto.request.LoginRequest;
import com.devconnect.socialnetwork.dto.request.SignupRequest;
import com.devconnect.socialnetwork.dto.response.AuthResponse;
import com.devconnect.socialnetwork.dto.response.UserProfileResponse;
import com.devconnect.socialnetwork.entity.UserEntity;
import com.devconnect.socialnetwork.exception.AccountInactiveException;
import com.devconnect.socialnetwork.exception.DuplicateResourceException;
import com.devconnect.socialnetwork.exception.ForbiddenException;
import com.devconnect.socialnetwork.exception.UnauthorizedException;
import com.devconnect.socialnetwork.exception.ValidationFailedException;
import com.devconnect.socialnetwork.mapper.UserMapper;
import com.devconnect.socialnetwork.repository.UserRepository;
import com.devconnect.socialnetwork.security.JwtService;
import com.devconnect.socialnetwork.util.Ids;
import com.devconnect.socialnetwork.util.TextNormalizer;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final TokenSessionService tokenSessionService;
    private final DeviceService deviceService;
    private final EmailVerificationService emailVerificationService;
    private final NotificationService notificationService;
    private final AuditService auditService;
    private final UserMapper userMapper;
    private final AppProperties properties;
    private final Clock clock;
    private final String dummyHash;

    public AuthService(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            JwtService jwtService,
            TokenSessionService tokenSessionService,
            DeviceService deviceService,
            EmailVerificationService emailVerificationService,
            NotificationService notificationService,
            AuditService auditService,
            UserMapper userMapper,
            AppProperties properties,
            Clock clock
    ) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.tokenSessionService = tokenSessionService;
        this.deviceService = deviceService;
        this.emailVerificationService = emailVerificationService;
        this.notificationService = notificationService;
        this.auditService = auditService;
        this.userMapper = userMapper;
        this.properties = properties;
        this.clock = clock;
        this.dummyHash = passwordEncoder.encode(TokenHasher.randomToken());
    }

    public AuthResponse signup(SignupRequest request) {
        String username = TextNormalizer.username(request.username());
        String email = TextNormalizer.email(request.email());
        assertPassword(request.password(), username, email);
        if (userRepository.existsByNormalizedUsername(username) || userRepository.existsByNormalizedEmail(email)) {
            throw new DuplicateResourceException("Username or email is already in use");
        }
        var now = clock.instant();
        UserEntity user = new UserEntity();
        user.setId(Ids.newId());
        user.setUsername(username);
        user.setNormalizedUsername(username);
        user.setEmail(email);
        user.setNormalizedEmail(email);
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setDisplayName(TextNormalizer.displayName(request.displayName()));
        user.setNormalizedDisplayName(TextNormalizer.displayNameKey(user.getDisplayName()));
        user.setBio("");
        user.setAccountType(AccountType.PUBLIC);
        user.setStatus(AccountStatus.ACTIVE);
        user.setRoles(Set.of(Role.USER));
        user.setEmailVerified(false);
        user.setCreatedAt(now);
        user.setUpdatedAt(now);
        try {
            userRepository.save(user);
        } catch (DuplicateKeyException ex) {
            throw new DuplicateResourceException("Username or email is already in use");
        }
        emailVerificationService.issue(user);
        auditService.record(AuditEventType.LOGIN, user.getId(), Map.of("reason", "signup"));
        return tokensFor(user, null);
    }

    public AuthResponse login(LoginRequest request) {
        String identifier = request.usernameOrEmail().trim();
        UserEntity user = identifier.contains("@")
                ? userRepository.findByNormalizedEmail(TextNormalizer.email(identifier)).orElse(null)
                : userRepository.findByNormalizedUsername(identifier.toLowerCase(Locale.ROOT)).orElse(null);
        String hash = user == null ? dummyHash : user.getPasswordHash();
        if (user == null || !passwordEncoder.matches(request.password(), hash)) {
            throw new UnauthorizedException("Invalid username or password");
        }
        if (user.getStatus() != AccountStatus.ACTIVE) {
            throw new AccountInactiveException("Account is not permitted to sign in");
        }
        if (properties.getSecurity().isRequireEmailVerified() && !user.isEmailVerified()) {
            throw new ForbiddenException("Email address is not verified");
        }
        user.setLastLoginAt(clock.instant());
        user.setUpdatedAt(clock.instant());
        userRepository.save(user);
        String deviceId = deviceService.touch(user.getId(), request.device());
        auditService.record(AuditEventType.LOGIN, user.getId(), Map.of());
        return tokensFor(user, deviceId);
    }

    public AuthResponse refresh(String refreshToken) {
        TokenSessionService.Rotation rotation = tokenSessionService.rotate(refreshToken);
        UserEntity user = rotation.user();
        if (user.getStatus() != AccountStatus.ACTIVE) {
            throw new UnauthorizedException("Invalid username or password");
        }
        String access = jwtService.createAccessToken(user, rotation.refresh().familyId());
        UserProfileResponse profile = userMapper.toSelf(user);
        return new AuthResponse("Bearer", access, rotation.refresh().rawToken(),
                jwtService.accessExpiryFromNow(), rotation.refresh().expiresAt(), profile);
    }

    public void logout(String userId, String refreshToken, String accessToken) {
        tokenSessionService.revokePresented(userId, refreshToken, accessToken);
        auditService.record(AuditEventType.LOGOUT, userId, Map.of());
    }

    public void changePassword(String userId, ChangePasswordRequest request) {
        UserEntity user = userRepository.findById(userId)
                .orElseThrow(() -> new UnauthorizedException("Authentication is required"));
        if (!passwordEncoder.matches(request.currentPassword(), user.getPasswordHash())) {
            throw new UnauthorizedException("Invalid username or password");
        }
        if (request.currentPassword().equals(request.newPassword())) {
            throw new ValidationFailedException("New password must be different from the current password");
        }
        assertPassword(request.newPassword(), user.getNormalizedUsername(), user.getNormalizedEmail());
        user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        user.setUpdatedAt(clock.instant());
        userRepository.save(user);
        tokenSessionService.revokeAll(userId);
        notificationService.notify(userId, NotificationType.SECURITY, null, null, "Your password was changed");
        auditService.record(AuditEventType.PASSWORD_CHANGED, userId, Map.of());
    }

    private AuthResponse tokensFor(UserEntity user, String deviceId) {
        TokenSessionService.IssuedRefresh refresh = tokenSessionService.issue(user.getId(), deviceId);
        String access = jwtService.createAccessToken(user, refresh.familyId());
        return new AuthResponse(
                "Bearer",
                access,
                refresh.rawToken(),
                jwtService.accessExpiryFromNow(),
                refresh.expiresAt(),
                userMapper.toSelf(user)
        );
    }

    private void assertPassword(String password, String username, String email) {
        String lower = password.toLowerCase(Locale.ROOT);
        if (lower.contains(username.toLowerCase(Locale.ROOT))) {
            throw new ValidationFailedException("Password must not contain the username");
        }
        int at = email.indexOf('@');
        String local = at > 0 ? email.substring(0, at) : email;
        if (local.length() >= 3 && lower.contains(local.toLowerCase(Locale.ROOT))) {
            throw new ValidationFailedException("Password must not contain the email name");
        }
    }
}
