package com.devconnect.socialnetwork.entity;

import com.devconnect.socialnetwork.domain.FriendRequestStatus;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

@Document(collection = "friendRequests")
@CompoundIndex(name = "friend_requests_recipient_status", def = "{'recipientId': 1, 'status': 1, 'createdAt': -1}")
@CompoundIndex(name = "friend_requests_sender_status", def = "{'senderId': 1, 'status': 1, 'createdAt': -1}")
public class FriendRequestEntity {

    @Id
    private String id;
    private String senderId;
    private String recipientId;
    private FriendRequestStatus status;
    private Instant createdAt;
    private Instant updatedAt;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getSenderId() {
        return senderId;
    }

    public void setSenderId(String senderId) {
        this.senderId = senderId;
    }

    public String getRecipientId() {
        return recipientId;
    }

    public void setRecipientId(String recipientId) {
        this.recipientId = recipientId;
    }

    public FriendRequestStatus getStatus() {
        return status;
    }

    public void setStatus(FriendRequestStatus status) {
        this.status = status;
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
}
