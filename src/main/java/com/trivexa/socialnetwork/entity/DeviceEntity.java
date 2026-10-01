package com.trivexa.socialnetwork.entity;

import com.trivexa.socialnetwork.domain.DevicePlatform;
import com.trivexa.socialnetwork.domain.KeyAlgorithm;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

@Document(collection = "devices")
@CompoundIndex(name = "devices_user_revoked", def = "{'userId': 1, 'revoked': 1}")
public class DeviceEntity {

    @Id
    private String id;
    private String userId;
    private String deviceName;
    private DevicePlatform platform;
    private KeyAlgorithm algorithm;
    private String publicKey;
    private Instant createdAt;
    private Instant lastSeenAt;
    private boolean revoked;
    private Instant revokedAt;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public String getDeviceName() {
        return deviceName;
    }

    public void setDeviceName(String deviceName) {
        this.deviceName = deviceName;
    }

    public DevicePlatform getPlatform() {
        return platform;
    }

    public void setPlatform(DevicePlatform platform) {
        this.platform = platform;
    }

    public KeyAlgorithm getAlgorithm() {
        return algorithm;
    }

    public void setAlgorithm(KeyAlgorithm algorithm) {
        this.algorithm = algorithm;
    }

    public String getPublicKey() {
        return publicKey;
    }

    public void setPublicKey(String publicKey) {
        this.publicKey = publicKey;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getLastSeenAt() {
        return lastSeenAt;
    }

    public void setLastSeenAt(Instant lastSeenAt) {
        this.lastSeenAt = lastSeenAt;
    }

    public boolean isRevoked() {
        return revoked;
    }

    public void setRevoked(boolean revoked) {
        this.revoked = revoked;
    }

    public Instant getRevokedAt() {
        return revokedAt;
    }

    public void setRevokedAt(Instant revokedAt) {
        this.revokedAt = revokedAt;
    }
}
