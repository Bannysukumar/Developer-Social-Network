package com.trivexa.socialnetwork.entity;

import com.trivexa.socialnetwork.domain.MessageStatus;
import com.trivexa.socialnetwork.domain.MessageType;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.Set;

@Document(collection = "messages")
@CompoundIndex(name = "messages_conversation_created", def = "{'conversationId': 1, 'createdAt': -1, '_id': -1}")
@CompoundIndex(name = "messages_recipient_status", def = "{'recipientId': 1, 'status': 1, 'createdAt': 1}")
public class MessageEntity {

    @Id
    private String id;
    private String conversationId;
    private String senderId;
    private String recipientId;
    private String ciphertext;
    private MessageType messageType;
    private MessageStatus status;
    private String clientMessageId;
    private String deviceId;
    private String keyId;
    private Instant createdAt;
    private Instant deliveredAt;
    private Instant readAt;
    private boolean deletedForEveryone;
    private Set<String> deletedForUserIds = new LinkedHashSet<>();

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getConversationId() {
        return conversationId;
    }

    public void setConversationId(String conversationId) {
        this.conversationId = conversationId;
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

    public String getCiphertext() {
        return ciphertext;
    }

    public void setCiphertext(String ciphertext) {
        this.ciphertext = ciphertext;
    }

    public MessageType getMessageType() {
        return messageType;
    }

    public void setMessageType(MessageType messageType) {
        this.messageType = messageType;
    }

    public MessageStatus getStatus() {
        return status;
    }

    public void setStatus(MessageStatus status) {
        this.status = status;
    }

    public String getClientMessageId() {
        return clientMessageId;
    }

    public void setClientMessageId(String clientMessageId) {
        this.clientMessageId = clientMessageId;
    }

    public String getDeviceId() {
        return deviceId;
    }

    public void setDeviceId(String deviceId) {
        this.deviceId = deviceId;
    }

    public String getKeyId() {
        return keyId;
    }

    public void setKeyId(String keyId) {
        this.keyId = keyId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getDeliveredAt() {
        return deliveredAt;
    }

    public void setDeliveredAt(Instant deliveredAt) {
        this.deliveredAt = deliveredAt;
    }

    public Instant getReadAt() {
        return readAt;
    }

    public void setReadAt(Instant readAt) {
        this.readAt = readAt;
    }

    public boolean isDeletedForEveryone() {
        return deletedForEveryone;
    }

    public void setDeletedForEveryone(boolean deletedForEveryone) {
        this.deletedForEveryone = deletedForEveryone;
    }

    public Set<String> getDeletedForUserIds() {
        return deletedForUserIds;
    }

    public void setDeletedForUserIds(Set<String> deletedForUserIds) {
        this.deletedForUserIds = deletedForUserIds;
    }
}
