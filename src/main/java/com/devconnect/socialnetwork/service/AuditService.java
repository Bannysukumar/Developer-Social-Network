package com.devconnect.socialnetwork.service;

import com.devconnect.socialnetwork.config.AppProperties;
import com.devconnect.socialnetwork.domain.AuditEventType;
import com.devconnect.socialnetwork.entity.AuditEventEntity;
import com.devconnect.socialnetwork.repository.AuditEventRepository;
import com.devconnect.socialnetwork.security.SecurityUtils;
import com.devconnect.socialnetwork.util.Ids;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

@Service
public class AuditService {

    private static final Logger log = LoggerFactory.getLogger(AuditService.class);

    private final AuditEventRepository repository;
    private final AppProperties properties;
    private final Clock clock;

    public AuditService(AuditEventRepository repository, AppProperties properties, Clock clock) {
        this.repository = repository;
        this.properties = properties;
        this.clock = clock;
    }

    public void record(AuditEventType type, String userId, Map<String, String> metadata) {
        try {
            AuditEventEntity event = new AuditEventEntity();
            event.setId(Ids.newId());
            event.setUserId(userId);
            event.setType(type);
            event.setMetadata(sanitize(metadata));
            event.setCreatedAt(clock.instant());
            ServletRequestAttributes attributes = currentRequest();
            if (attributes != null) {
                HttpServletRequest request = attributes.getRequest();
                event.setIpAddress(SecurityUtils.clientIp(request, properties.getSecurity().isTrustProxy()));
                String agent = request.getHeader("User-Agent");
                if (agent != null) {
                    event.setUserAgent(agent.length() > 256 ? agent.substring(0, 256) : agent);
                }
            }
            repository.save(event);
        } catch (RuntimeException ex) {
            log.error("Audit write failed type={}", type);
        }
    }

    private Map<String, String> sanitize(Map<String, String> metadata) {
        Map<String, String> safe = new LinkedHashMap<>();
        if (metadata == null) {
            return safe;
        }
        metadata.forEach((key, value) -> {
            String lowered = key.toLowerCase(Locale.ROOT);
            if (lowered.contains("password") || lowered.contains("token") || lowered.contains("secret") || lowered.contains("ciphertext")) {
                return;
            }
            if (value != null) {
                safe.put(key, value.length() > 200 ? value.substring(0, 200) : value);
            }
        });
        return safe;
    }

    private ServletRequestAttributes currentRequest() {
        if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attributes) {
            return attributes;
        }
        return null;
    }
}
