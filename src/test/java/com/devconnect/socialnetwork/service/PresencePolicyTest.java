package com.devconnect.socialnetwork.service;

import com.devconnect.socialnetwork.domain.AccountType;
import com.devconnect.socialnetwork.domain.RelationshipView;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PresencePolicyTest {

    @Test
    void hidesPresenceWhenBlockedOrActivityIsOff() {
        assertFalse(PresencePolicy.canSee(true, true, AccountType.PUBLIC, RelationshipView.FRIENDS));
        assertFalse(PresencePolicy.canSee(false, false, AccountType.PUBLIC, RelationshipView.FRIENDS));
        assertFalse(PresencePolicy.activityVisible(Boolean.FALSE));
        assertTrue(PresencePolicy.activityVisible(null));
    }

    @Test
    void showsFriendsAndPublicProfilesOnly() {
        assertTrue(PresencePolicy.canSee(false, true, AccountType.PRIVATE, RelationshipView.FRIENDS));
        assertFalse(PresencePolicy.canSee(false, true, AccountType.PRIVATE, RelationshipView.NONE));
        assertTrue(PresencePolicy.canSee(false, true, AccountType.PUBLIC, RelationshipView.NONE));
        assertFalse(PresencePolicy.canSee(false, true, AccountType.PUBLIC, RelationshipView.BLOCKED));
    }
}
