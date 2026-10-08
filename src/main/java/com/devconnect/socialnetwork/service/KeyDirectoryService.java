package com.devconnect.socialnetwork.service;

import com.devconnect.socialnetwork.crypto.Ed25519Signatures;
import com.devconnect.socialnetwork.crypto.PublicKeyMaterial;
import com.devconnect.socialnetwork.domain.KeyAlgorithm;
import com.devconnect.socialnetwork.domain.AccountStatus;
import com.devconnect.socialnetwork.domain.PreKeyType;
import com.devconnect.socialnetwork.dto.request.PreKeyUploadRequest;
import com.devconnect.socialnetwork.dto.request.RegisterIdentityKeyRequest;
import com.devconnect.socialnetwork.dto.request.RegisterPreKeysRequest;
import com.devconnect.socialnetwork.dto.response.DeviceResponse;
import com.devconnect.socialnetwork.dto.response.KeyBundleResponse;
import com.devconnect.socialnetwork.entity.DeviceEntity;
import com.devconnect.socialnetwork.entity.IdentityKeyEntity;
import com.devconnect.socialnetwork.entity.PreKeyEntity;
import com.devconnect.socialnetwork.entity.UserEntity;
import com.devconnect.socialnetwork.exception.ForbiddenException;
import com.devconnect.socialnetwork.exception.InvalidStateException;
import com.devconnect.socialnetwork.exception.ResourceNotFoundException;
import com.devconnect.socialnetwork.exception.ValidationFailedException;
import com.devconnect.socialnetwork.repository.DeviceRepository;
import com.devconnect.socialnetwork.repository.IdentityKeyRepository;
import com.devconnect.socialnetwork.repository.PreKeyRepository;
import com.devconnect.socialnetwork.repository.UserRepository;
import com.devconnect.socialnetwork.util.Ids;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.mongodb.core.FindAndModifyOptions;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.util.ArrayList;
import java.util.List;

@Service
public class KeyDirectoryService {

    private final DeviceRepository deviceRepository;
    private final IdentityKeyRepository identityKeyRepository;
    private final PreKeyRepository preKeyRepository;
    private final UserRepository userRepository;
    private final DeviceService deviceService;
    private final FriendshipService friendshipService;
    private final BlockService blockService;
    private final MongoTemplate mongoTemplate;
    private final Clock clock;

    public KeyDirectoryService(
            DeviceRepository deviceRepository,
            IdentityKeyRepository identityKeyRepository,
            PreKeyRepository preKeyRepository,
            UserRepository userRepository,
            DeviceService deviceService,
            FriendshipService friendshipService,
            BlockService blockService,
            MongoTemplate mongoTemplate,
            Clock clock
    ) {
        this.deviceRepository = deviceRepository;
        this.identityKeyRepository = identityKeyRepository;
        this.preKeyRepository = preKeyRepository;
        this.userRepository = userRepository;
        this.deviceService = deviceService;
        this.friendshipService = friendshipService;
        this.blockService = blockService;
        this.mongoTemplate = mongoTemplate;
        this.clock = clock;
    }

    public DeviceResponse registerIdentity(String userId, RegisterIdentityKeyRequest request) {
        String publicKey = PublicKeyMaterial.requirePublicKey(request.publicKey());
        DeviceEntity device;
        if (request.deviceId() == null || request.deviceId().isBlank()) {
            if (deviceRepository.countByUserIdAndRevokedFalse(userId) >= DeviceService.MAX_ACTIVE_DEVICES) {
                throw new ValidationFailedException("The active device limit has been reached");
            }
            device = new DeviceEntity();
            device.setId(Ids.newId());
            device.setUserId(userId);
            device.setCreatedAt(clock.instant());
        } else {
            device = deviceService.requireActive(userId, request.deviceId());
        }
        device.setDeviceName(request.deviceName().trim());
        device.setPlatform(request.platform());
        device.setAlgorithm(request.algorithm());
        device.setPublicKey(publicKey);
        device.setLastSeenAt(clock.instant());
        deviceRepository.save(device);

        IdentityKeyEntity identity = identityKeyRepository.findByDeviceId(device.getId()).orElseGet(IdentityKeyEntity::new);
        if (identity.getId() == null) {
            identity.setId(Ids.newId());
            identity.setCreatedAt(clock.instant());
        }
        identity.setUserId(userId);
        identity.setDeviceId(device.getId());
        identity.setAlgorithm(request.algorithm());
        identity.setPublicKey(publicKey);
        identity.setUpdatedAt(clock.instant());
        identityKeyRepository.save(identity);
        return new DeviceResponse(device.getId(), device.getDeviceName(), device.getPlatform(), device.getAlgorithm(),
                device.getPublicKey(), device.getCreatedAt(), device.getLastSeenAt(), device.isRevoked());
    }

    public void registerPreKeys(String userId, RegisterPreKeysRequest request) {
        DeviceEntity device = deviceService.requireActive(userId, request.deviceId());
        if (request.signedPreKey() == null && (request.oneTimePreKeys() == null || request.oneTimePreKeys().isEmpty())) {
            throw new ValidationFailedException("At least one prekey is required");
        }
        if (request.signedPreKey() != null) {
            if (request.signedPreKey().signature() == null || request.signedPreKey().signature().isBlank()) {
                throw new ValidationFailedException("Signed prekey signature is required");
            }
            preKeyRepository.deleteByDeviceIdAndType(device.getId(), PreKeyType.SIGNED);
            savePreKey(userId, device.getId(), request.signedPreKey(), PreKeyType.SIGNED);
        }
        if (request.oneTimePreKeys() != null) {
            long unused = preKeyRepository.countByDeviceIdAndTypeAndConsumedFalse(device.getId(), PreKeyType.ONE_TIME);
            if (unused + request.oneTimePreKeys().size() > 100) {
                throw new ValidationFailedException("Too many unused one-time prekeys");
            }
            for (PreKeyUploadRequest upload : request.oneTimePreKeys()) {
                savePreKey(userId, device.getId(), upload, PreKeyType.ONE_TIME);
            }
        }
    }

    public KeyBundleResponse bundle(String requesterId, String targetUserId) {
        Ids.require(targetUserId);
        UserEntity target = userRepository.findById(targetUserId)
                .orElseThrow(() -> new ResourceNotFoundException("Resource not found"));
        if (target.getStatus() != AccountStatus.ACTIVE) {
            throw new ResourceNotFoundException("Resource not found");
        }
        if (blockService.eitherBlocked(requesterId, targetUserId)) {
            throw new ResourceNotFoundException("Resource not found");
        }
        boolean self = requesterId.equals(targetUserId);
        if (!self && !friendshipService.areFriends(requesterId, targetUserId)) {
            throw new ForbiddenException("Key material is available to friends");
        }
        List<KeyBundleResponse.DeviceBundle> bundles = new ArrayList<>();
        for (DeviceEntity device : deviceRepository.findByUserIdAndRevokedFalse(targetUserId)) {
            IdentityKeyEntity identity = identityKeyRepository.findByDeviceId(device.getId()).orElse(null);
            if (identity == null) {
                continue;
            }
            PreKeyEntity signed = preKeyRepository.findByDeviceIdAndType(device.getId(), PreKeyType.SIGNED).orElse(null);
            PreKeyEntity oneTime = self ? null : consumeOneTime(device.getId(), requesterId);
            int unused = (int) preKeyRepository.countByDeviceIdAndTypeAndConsumedFalse(device.getId(), PreKeyType.ONE_TIME);
            bundles.add(new KeyBundleResponse.DeviceBundle(
                    device.getId(),
                    identity.getAlgorithm(),
                    identity.getPublicKey(),
                    signed == null ? null : new KeyBundleResponse.PreKeyMaterial(signed.getPreKeyId(), signed.getPublicKey(), signed.getSignature()),
                    oneTime == null ? null : new KeyBundleResponse.PreKeyMaterial(oneTime.getPreKeyId(), oneTime.getPublicKey(), null),
                    self ? unused : null
            ));
        }
        return new KeyBundleResponse(targetUserId, bundles);
    }

    public void revokeDevice(String userId, String deviceId) {
        deviceService.revoke(userId, deviceId);
    }

    private void savePreKey(String userId, String deviceId, PreKeyUploadRequest upload, PreKeyType type) {
        var existing = preKeyRepository.findByDeviceIdAndPreKeyId(deviceId, upload.preKeyId());
        if (existing.isPresent()) {
            if (existing.get().isConsumed() || existing.get().getType() != type) {
                throw new InvalidStateException("Prekey id is already used");
            }
            return;
        }
        PreKeyEntity entity = new PreKeyEntity();
        entity.setId(Ids.newId());
        entity.setUserId(userId);
        entity.setDeviceId(deviceId);
        entity.setPreKeyId(upload.preKeyId());
        entity.setType(type);
        entity.setPublicKey(PublicKeyMaterial.requirePublicKey(upload.publicKey()));
        if (type == PreKeyType.SIGNED) {
            String signature = PublicKeyMaterial.requireSignature(upload.signature());
            IdentityKeyEntity identity = identityKeyRepository.findByDeviceId(deviceId)
                    .orElseThrow(() -> new ValidationFailedException("Register an identity key before uploading a signed prekey"));
            if (identity.getAlgorithm() == KeyAlgorithm.Ed25519) {
                Ed25519Signatures.verify(identity.getPublicKey(), entity.getPublicKey(), signature);
            }
            entity.setSignature(signature);
        }
        entity.setCreatedAt(clock.instant());
        try {
            preKeyRepository.save(entity);
        } catch (DuplicateKeyException ex) {
            throw new InvalidStateException("Prekey id is already used");
        }
    }

    private PreKeyEntity consumeOneTime(String deviceId, String requesterId) {
        Query query = Query.query(Criteria.where("deviceId").is(deviceId)
                .and("type").is(PreKeyType.ONE_TIME)
                .and("consumed").is(false));
        Update update = new Update()
                .set("consumed", true)
                .set("consumedAt", clock.instant())
                .set("consumedByUserId", requesterId);
        return mongoTemplate.findAndModify(query, update, FindAndModifyOptions.options().returnNew(false), PreKeyEntity.class);
    }
}
