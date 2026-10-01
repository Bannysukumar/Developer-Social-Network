package com.devconnect.socialnetwork.entity;

import com.devconnect.socialnetwork.domain.PreKeyType;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

@Document(collection = "preKeys")
@CompoundIndex(name = "prekeys_device_key_unique", def = "{'deviceId': 1, 'preKeyId': 1}", unique = true)
@CompoundIndex(name = "prekeys_device_available", def = "{'deviceId': 1, 'type': 1, 'consumed': 1}")
public class PreKeyEntity {

    @Id
    private String id;
    private String userId;
    private String deviceId;
    private int preKeyId;
    private PreKeyType type;
    private String publicKey;
    private String signature;
    private boolean consumed;
    private Instant consumedAt;
    private String consumedByUserId;
    private Instant createdAt;

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

    public String getDeviceId() {
        return deviceId;
    }

    public void setDeviceId(String deviceId) {
        this.deviceId = deviceId;
    }

    public int getPreKeyId() {
        return preKeyId;
    }

    public void setPreKeyId(int preKeyId) {
        this.preKeyId = preKeyId;
    }

    public PreKeyType getType() {
        return type;
    }

    public void setType(PreKeyType type) {
        this.type = type;
    }

    public String getPublicKey() {
        return publicKey;
    }

    public void setPublicKey(String publicKey) {
        this.publicKey = publicKey;
    }

    public String getSignature() {
        return signature;
    }

    public void setSignature(String signature) {
        this.signature = signature;
    }

    public boolean isConsumed() {
        return consumed;
    }

    public void setConsumed(boolean consumed) {
        this.consumed = consumed;
    }

    public Instant getConsumedAt() {
        return consumedAt;
    }

    public void setConsumedAt(Instant consumedAt) {
        this.consumedAt = consumedAt;
    }

    public String getConsumedByUserId() {
        return consumedByUserId;
    }

    public void setConsumedByUserId(String consumedByUserId) {
        this.consumedByUserId = consumedByUserId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
