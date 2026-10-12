package com.devconnect.socialnetwork.entity;

import com.devconnect.socialnetwork.domain.ConversationType;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Document(collection = "conversations")
public class ConversationEntity {

    @Id
    private String id;
    private ConversationType type;
    @Indexed
    private List<String> participantIds = new ArrayList<>();
    @Indexed(unique = true)
    private String participantKey;
    private Instant createdAt;
    private Instant updatedAt;
    /** Per participant, messages at or before this instant are hidden from that person only. */
    private Map<String, Instant> historyClearedAt = new LinkedHashMap<>();

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public ConversationType getType() {
        return type;
    }

    public void setType(ConversationType type) {
        this.type = type;
    }

    public List<String> getParticipantIds() {
        return participantIds;
    }

    public void setParticipantIds(List<String> participantIds) {
        this.participantIds = participantIds;
    }

    public String getParticipantKey() {
        return participantKey;
    }

    public void setParticipantKey(String participantKey) {
        this.participantKey = participantKey;
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

    public Map<String, Instant> getHistoryClearedAt() {
        if (historyClearedAt == null) {
            historyClearedAt = new LinkedHashMap<>();
        }
        return historyClearedAt;
    }

    public void setHistoryClearedAt(Map<String, Instant> historyClearedAt) {
        this.historyClearedAt = historyClearedAt;
    }

    public String otherParticipant(String userId) {
        return participantIds.stream()
                .filter(id -> !id.equals(userId))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("Conversation is missing a participant"));
    }
}
