package com.trivexa.socialnetwork.entity;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

@Document(collection = "revokedTokenFamilies")
public class RevokedTokenFamilyEntity {

    @Id
    private String familyId;
    private String userId;
    @Indexed(expireAfterSeconds = 0)
    private Instant expiresAt;

    public RevokedTokenFamilyEntity() {
    }

    public RevokedTokenFamilyEntity(String familyId, String userId, Instant expiresAt) {
        this.familyId = familyId;
        this.userId = userId;
        this.expiresAt = expiresAt;
    }

    public String getFamilyId() {
        return familyId;
    }

    public void setFamilyId(String familyId) {
        this.familyId = familyId;
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public void setExpiresAt(Instant expiresAt) {
        this.expiresAt = expiresAt;
    }
}
