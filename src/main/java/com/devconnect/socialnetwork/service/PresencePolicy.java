package com.devconnect.socialnetwork.service;

import com.devconnect.socialnetwork.domain.AccountType;
import com.devconnect.socialnetwork.domain.RelationshipView;

/** Who may learn that another account is online or when it was last seen. */
public final class PresencePolicy {

    private PresencePolicy() {
    }

    public static boolean canSee(boolean blocked, boolean activityVisible, AccountType accountType, RelationshipView relationship) {
        if (blocked || !activityVisible) {
            return false;
        }
        if (relationship == RelationshipView.BLOCKED) {
            return false;
        }
        if (accountType == AccountType.PRIVATE && relationship != RelationshipView.FRIENDS && relationship != RelationshipView.SELF) {
            return false;
        }
        return true;
    }

    public static boolean activityVisible(Boolean showActivityStatus) {
        return !Boolean.FALSE.equals(showActivityStatus);
    }
}
