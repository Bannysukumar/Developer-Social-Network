package com.devconnect.socialnetwork.service;

import com.devconnect.socialnetwork.config.AppProperties;
import com.devconnect.socialnetwork.crypto.TokenHasher;
import com.devconnect.socialnetwork.domain.AccountStatus;
import com.devconnect.socialnetwork.domain.AuditEventType;
import com.devconnect.socialnetwork.domain.NotificationType;
import com.devconnect.socialnetwork.entity.PasswordResetTokenEntity;
import com.devconnect.socialnetwork.entity.UserEntity;
import com.devconnect.socialnetwork.exception.InvalidTokenException;
import com.devconnect.socialnetwork.exception.ValidationFailedException;
import com.devconnect.socialnetwork.notification.EmailSender;
import com.devconnect.socialnetwork.repository.PasswordResetTokenRepository;
import com.devconnect.socialnetwork.repository.UserRepository;
import com.devconnect.socialnetwork.util.Ids;
import com.devconnect.socialnetwork.util.TextNormalizer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.mongodb.core.FindAndModifyOptions;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.util.Locale;
import java.util.Map;

@Service
public class PasswordResetService {

    private static final Logger log = LoggerFactory.getLogger(PasswordResetService.class);
    private static final Duration TTL = Duration.ofHours(1);
    public static final String GENERIC_MESSAGE = "If an account exists for that email, password reset instructions have been sent";

    private final PasswordResetTokenRepository repository;
    private final UserRepository userRepository;
    private final EmailSender emailSender;
    private final PasswordEncoder passwordEncoder;
    private final TokenSessionService tokenSessionService;
    private final NotificationService notificationService;
    private final AuditService auditService;
    private final AppProperties properties;
    private final MongoTemplate mongoTemplate;
    private final Clock clock;

    public PasswordResetService(
            PasswordResetTokenRepository repository,
            UserRepository userRepository,
            EmailSender emailSender,
            PasswordEncoder passwordEncoder,
            TokenSessionService tokenSessionService,
            NotificationService notificationService,
            AuditService auditService,
            AppProperties properties,
            MongoTemplate mongoTemplate,
            Clock clock
    ) {
        this.repository = repository;
        this.userRepository = userRepository;
        this.emailSender = emailSender;
        this.passwordEncoder = passwordEncoder;
        this.tokenSessionService = tokenSessionService;
        this.notificationService = notificationService;
        this.auditService = auditService;
        this.properties = properties;
        this.mongoTemplate = mongoTemplate;
        this.clock = clock;
    }

    public void request(String email) {
        TokenHasher.sha256(TokenHasher.randomToken());
        userRepository.findByNormalizedEmail(TextNormalizer.email(email))
                .filter(user -> user.getStatus() == AccountStatus.ACTIVE)
                .ifPresent(this::issue);
    }

    public void reset(String rawToken, String newPassword) {
        PasswordResetTokenEntity token = consume(rawToken);
        UserEntity user = userRepository.findById(token.getUserId())
                .orElseThrow(() -> new InvalidTokenException("Reset token is invalid or expired"));
        if (user.getStatus() != AccountStatus.ACTIVE) {
            throw new InvalidTokenException("Reset token is invalid or expired");
        }
        assertPassword(newPassword, user);
        if (passwordEncoder.matches(newPassword, user.getPasswordHash())) {
            throw new ValidationFailedException("New password must be different from the current password");
        }
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        user.setUpdatedAt(clock.instant());
        userRepository.save(user);
        tokenSessionService.revokeAll(user.getId());
        notificationService.notify(user.getId(), NotificationType.SECURITY, null, null, "Your password was reset");
        auditService.record(AuditEventType.PASSWORD_RESET, user.getId(), Map.of());
    }

    private void issue(UserEntity user) {
        repository.deleteByUserId(user.getId());
        String token = TokenHasher.randomToken();
        PasswordResetTokenEntity entity = new PasswordResetTokenEntity();
        entity.setId(Ids.newId());
        entity.setUserId(user.getId());
        entity.setTokenHash(TokenHasher.sha256(token));
        entity.setCreatedAt(clock.instant());
        entity.setExpiresAt(clock.instant().plus(TTL));
        repository.save(entity);
        String link = properties.getMail().getPublicAppUrl() + "/reset-password#token=" + token;
        String body = """
                A password reset was requested.
                Submit the token to POST /api/v1/auth/reset-password.
                %s
                The token expires in 1 hour and can be used once.
                """.formatted(link);
        try {
            emailSender.send(user.getEmail(), "Reset your password", body);
        } catch (RuntimeException ex) {
            log.error("Password reset email was not sent userId={}", user.getId());
        }
    }

    private PasswordResetTokenEntity consume(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            throw new InvalidTokenException("Reset token is invalid or expired");
        }
        PasswordResetTokenEntity consumed = mongoTemplate.findAndModify(
                Query.query(Criteria.where("tokenHash").is(TokenHasher.sha256(rawToken.trim()))
                        .and("used").is(false)
                        .and("expiresAt").gt(clock.instant())),
                new Update().set("used", true),
                FindAndModifyOptions.options().returnNew(false),
                PasswordResetTokenEntity.class
        );
        if (consumed == null) {
            throw new InvalidTokenException("Reset token is invalid or expired");
        }
        return consumed;
    }

    private void assertPassword(String password, UserEntity user) {
        String lower = password.toLowerCase(Locale.ROOT);
        if (lower.contains(user.getNormalizedUsername())) {
            throw new ValidationFailedException("Password must not contain the username");
        }
    }
}
