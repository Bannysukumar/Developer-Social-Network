package com.trivexa.socialnetwork.service;

import com.trivexa.socialnetwork.domain.AuditEventType;
import com.trivexa.socialnetwork.domain.DevicePlatform;
import com.trivexa.socialnetwork.dto.request.DeviceContextRequest;
import com.trivexa.socialnetwork.dto.response.DeviceResponse;
import com.trivexa.socialnetwork.entity.DeviceEntity;
import com.trivexa.socialnetwork.exception.ResourceNotFoundException;
import com.trivexa.socialnetwork.exception.ValidationFailedException;
import com.trivexa.socialnetwork.repository.DeviceRepository;
import com.trivexa.socialnetwork.repository.IdentityKeyRepository;
import com.trivexa.socialnetwork.repository.PreKeyRepository;
import com.trivexa.socialnetwork.util.Ids;
import org.bson.types.ObjectId;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.util.List;
import java.util.Map;

@Service
public class DeviceService {

    public static final int MAX_ACTIVE_DEVICES = 10;

    private final DeviceRepository deviceRepository;
    private final IdentityKeyRepository identityKeyRepository;
    private final PreKeyRepository preKeyRepository;
    private final TokenSessionService tokenSessionService;
    private final AuditService auditService;
    private final Clock clock;

    public DeviceService(
            DeviceRepository deviceRepository,
            IdentityKeyRepository identityKeyRepository,
            PreKeyRepository preKeyRepository,
            TokenSessionService tokenSessionService,
            AuditService auditService,
            Clock clock
    ) {
        this.deviceRepository = deviceRepository;
        this.identityKeyRepository = identityKeyRepository;
        this.preKeyRepository = preKeyRepository;
        this.tokenSessionService = tokenSessionService;
        this.auditService = auditService;
        this.clock = clock;
    }

    public String touch(String userId, DeviceContextRequest context) {
        if (context == null) {
            return null;
        }
        if (context.deviceId() != null && !context.deviceId().isBlank()) {
            if (!ObjectId.isValid(context.deviceId())) {
                throw new ValidationFailedException("Device id is invalid");
            }
            DeviceEntity device = deviceRepository.findByIdAndUserId(context.deviceId(), userId)
                    .orElseThrow(() -> new ResourceNotFoundException("Resource not found"));
            if (device.isRevoked()) {
                throw new ValidationFailedException("Device is revoked");
            }
            device.setLastSeenAt(clock.instant());
            if (context.deviceName() != null && !context.deviceName().isBlank()) {
                device.setDeviceName(context.deviceName().trim());
            }
            if (context.platform() != null) {
                device.setPlatform(context.platform());
            }
            deviceRepository.save(device);
            return device.getId();
        }
        if (context.deviceName() == null || context.deviceName().isBlank()) {
            return null;
        }
        if (deviceRepository.countByUserIdAndRevokedFalse(userId) >= MAX_ACTIVE_DEVICES) {
            throw new ValidationFailedException("The active device limit has been reached");
        }
        DeviceEntity device = new DeviceEntity();
        device.setId(Ids.newId());
        device.setUserId(userId);
        device.setDeviceName(context.deviceName().trim());
        device.setPlatform(context.platform() == null ? DevicePlatform.UNKNOWN : context.platform());
        device.setCreatedAt(clock.instant());
        device.setLastSeenAt(clock.instant());
        deviceRepository.save(device);
        auditService.record(AuditEventType.DEVICE_ADDED, userId, Map.of("deviceId", device.getId()));
        return device.getId();
    }

    public List<DeviceResponse> list(String userId, boolean includeRevoked) {
        List<DeviceEntity> devices = includeRevoked
                ? deviceRepository.findByUserId(userId)
                : deviceRepository.findByUserIdAndRevokedFalse(userId);
        return devices.stream().map(this::toResponse).toList();
    }

    public void revoke(String userId, String deviceId) {
        Ids.require(deviceId);
        DeviceEntity device = deviceRepository.findByIdAndUserId(deviceId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Resource not found"));
        if (!device.isRevoked()) {
            device.setRevoked(true);
            device.setRevokedAt(clock.instant());
            device.setPublicKey(null);
            deviceRepository.save(device);
            identityKeyRepository.deleteByDeviceId(deviceId);
            preKeyRepository.deleteByDeviceId(deviceId);
            tokenSessionService.revokeDevice(deviceId);
            auditService.record(AuditEventType.DEVICE_REVOKED, userId, Map.of("deviceId", deviceId));
        }
    }

    public DeviceEntity requireActive(String userId, String deviceId) {
        Ids.require(deviceId);
        DeviceEntity device = deviceRepository.findByIdAndUserId(deviceId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Resource not found"));
        if (device.isRevoked()) {
            throw new ValidationFailedException("Device is revoked");
        }
        return device;
    }

    public void markSeen(String userId) {
        deviceRepository.findByUserIdAndRevokedFalse(userId).stream().findFirst().ifPresent(device -> {
            device.setLastSeenAt(clock.instant());
            deviceRepository.save(device);
        });
    }

    private DeviceResponse toResponse(DeviceEntity device) {
        return new DeviceResponse(
                device.getId(),
                device.getDeviceName(),
                device.getPlatform(),
                device.getAlgorithm(),
                device.getPublicKey(),
                device.getCreatedAt(),
                device.getLastSeenAt(),
                device.isRevoked()
        );
    }
}
