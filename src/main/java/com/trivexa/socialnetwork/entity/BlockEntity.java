package com.trivexa.socialnetwork.entity;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

@Document(collection = "blocks")
@CompoundIndex(name = "blocks_pair_unique", def = "{'blockerId': 1, 'blockedId': 1}", unique = true)
public class BlockEntity {

    @Id
    private String id;
    @Indexed
    private String blockerId;
    @Indexed
    private String blockedId;
    private Instant createdAt;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getBlockerId() {
        return blockerId;
    }

    public void setBlockerId(String blockerId) {
        this.blockerId = blockerId;
    }

    public String getBlockedId() {
        return blockedId;
    }

    public void setBlockedId(String blockedId) {
        this.blockedId = blockedId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
