package com.trivexa.socialnetwork.service;

import com.trivexa.socialnetwork.config.AppProperties;
import com.trivexa.socialnetwork.crypto.TokenHasher;
import com.trivexa.socialnetwork.domain.AccountStatus;
import com.trivexa.socialnetwork.domain.AuditEventType;
import com.trivexa.socialnetwork.entity.EmailVerificationTokenEntity;
import com.trivexa.socialnetwork.entity.UserEntity;
import com.trivexa.socialnetwork.exception.InvalidTokenException;
import com.trivexa.socialnetwork.notification.EmailSender;
import com.trivexa.socialnetwork.repository.EmailVerificationTokenRepository;
import com.trivexa.socialnetwork.repository.UserRepository;
import com.trivexa.socialnetwork.util.Ids;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.mongodb.core.FindAndModifyOptions;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.util.Map;

@Service
public class EmailVerificationService {

    private static final Logger log = LoggerFactory.getLogger(EmailVerificationService.class);
    private static final Duration TTL = Duration.ofHours(24);

    private final EmailVerificationTokenRepository repository;
    private final UserRepository userRepository;
    private final EmailSender emailSender;
    private final AuditService auditService;
    private final AppProperties properties;
    private final MongoTemplate mongoTemplate;
    private final Clock clock;

    public EmailVerificationService(
            EmailVerificationTokenRepository repository,
            UserRepository userRepository,
            EmailSender emailSender,
            AuditService auditService,
            AppProperties properties,
            MongoTemplate mongoTemplate,
            Clock clock
    ) {
        this.repository = repository;
        this.userRepository = userRepository;
        this.emailSender = emailSender;
        this.auditService = auditService;
        this.properties = properties;
        this.mongoTemplate = mongoTemplate;
        this.clock = clock;
    }

    public void issue(UserEntity user) {
        repository.deleteByUserId(user.getId());
        String token = TokenHasher.randomToken();
        EmailVerificationTokenEntity entity = new EmailVerificationTokenEntity();
        entity.setId(Ids.newId());
        entity.setUserId(user.getId());
        entity.setTokenHash(TokenHasher.sha256(token));
        entity.setCreatedAt(clock.instant());
        entity.setExpiresAt(clock.instant().plus(TTL));
        repository.save(entity);
        String link = properties.getMail().getPublicAppUrl() + "/verify-email#token=" + token;
        String body = """
                Confirm your email address.
                Submit the token to POST /api/v1/auth/verify-email.
                %s
                The token expires in 24 hours and can be used once.
                """.formatted(link);
        try {
            emailSender.send(user.getEmail(), "Verify your email", body);
        } catch (RuntimeException ex) {
            log.error("Verification email was not sent userId={}", user.getId());
        }
    }

    public void verify(String rawToken) {
        EmailVerificationTokenEntity token = consume(rawToken);
        UserEntity user = userRepository.findById(token.getUserId())
                .orElseThrow(() -> new InvalidTokenException("Verification token is invalid or expired"));
        if (user.getStatus() != AccountStatus.ACTIVE) {
            throw new InvalidTokenException("Verification token is invalid or expired");
        }
        user.setEmailVerified(true);
        user.setUpdatedAt(clock.instant());
        userRepository.save(user);
        auditService.record(AuditEventType.EMAIL_VERIFIED, user.getId(), Map.of());
    }

    public void resend(String userId) {
        UserEntity user = userRepository.findById(userId)
                .orElseThrow(() -> new InvalidTokenException("Verification token is invalid or expired"));
        if (user.isEmailVerified() || user.getStatus() != AccountStatus.ACTIVE) {
            return;
        }
        issue(user);
    }

    private EmailVerificationTokenEntity consume(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
            throw new InvalidTokenException("Verification token is invalid or expired");
        }
        String hash = TokenHasher.sha256(rawToken.trim());
        EmailVerificationTokenEntity consumed = mongoTemplate.findAndModify(
                Query.query(Criteria.where("tokenHash").is(hash).and("used").is(false).and("expiresAt").gt(clock.instant())),
                new Update().set("used", true),
                FindAndModifyOptions.options().returnNew(false),
                EmailVerificationTokenEntity.class
        );
        if (consumed == null) {
            throw new InvalidTokenException("Verification token is invalid or expired");
        }
        return consumed;
    }
}
