package com.devconnect.socialnetwork.entity;

import com.devconnect.socialnetwork.domain.AccountStatus;
import com.devconnect.socialnetwork.domain.AccountType;
import com.devconnect.socialnetwork.domain.Role;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.Set;

@Document(collection = "users")
public class UserEntity {

    @Id
    private String id;
    private String username;
    @Indexed(unique = true)
    private String normalizedUsername;
    private String email;
    @Indexed(unique = true)
    private String normalizedEmail;
    private String passwordHash;
    private String displayName;
    @Indexed
    private String normalizedDisplayName;
    private String bio;
    private String profileImageFileId;
    private AccountType accountType;
    @Indexed
    private AccountStatus status;
    private Set<Role> roles = new LinkedHashSet<>();
    private boolean emailVerified;
    private Instant sessionValidAfter;
    private Instant createdAt;
    private Instant updatedAt;
    private Instant lastLoginAt;
    private Instant lastSeenAt;
    private Boolean showActivityStatus;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getNormalizedUsername() {
        return normalizedUsername;
    }

    public void setNormalizedUsername(String normalizedUsername) {
        this.normalizedUsername = normalizedUsername;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getNormalizedEmail() {
        return normalizedEmail;
    }

    public void setNormalizedEmail(String normalizedEmail) {
        this.normalizedEmail = normalizedEmail;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public String getNormalizedDisplayName() {
        return normalizedDisplayName;
    }

    public void setNormalizedDisplayName(String normalizedDisplayName) {
        this.normalizedDisplayName = normalizedDisplayName;
    }

    public String getBio() {
        return bio;
    }

    public void setBio(String bio) {
        this.bio = bio;
    }

    public String getProfileImageFileId() {
        return profileImageFileId;
    }

    public void setProfileImageFileId(String profileImageFileId) {
        this.profileImageFileId = profileImageFileId;
    }

    public AccountType getAccountType() {
        return accountType;
    }

    public void setAccountType(AccountType accountType) {
        this.accountType = accountType;
    }

    public AccountStatus getStatus() {
        return status;
    }

    public void setStatus(AccountStatus status) {
        this.status = status;
    }

    public Set<Role> getRoles() {
        return roles;
    }

    public void setRoles(Set<Role> roles) {
        this.roles = roles;
    }

    public boolean isEmailVerified() {
        return emailVerified;
    }

    public void setEmailVerified(boolean emailVerified) {
        this.emailVerified = emailVerified;
    }

    public Instant getSessionValidAfter() {
        return sessionValidAfter;
    }

    public void setSessionValidAfter(Instant sessionValidAfter) {
        this.sessionValidAfter = sessionValidAfter;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }

    public Instant getLastLoginAt() {
        return lastLoginAt;
    }

    public void setLastLoginAt(Instant lastLoginAt) {
        this.lastLoginAt = lastLoginAt;
    }

    public Instant getLastSeenAt() {
        return lastSeenAt;
    }

    public void setLastSeenAt(Instant lastSeenAt) {
        this.lastSeenAt = lastSeenAt;
    }

    public Boolean getShowActivityStatus() {
        return showActivityStatus;
    }

    public void setShowActivityStatus(Boolean showActivityStatus) {
        this.showActivityStatus = showActivityStatus;
    }
}
