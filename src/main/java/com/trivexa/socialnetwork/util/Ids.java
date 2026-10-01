package com.trivexa.socialnetwork.util;

import com.trivexa.socialnetwork.exception.ResourceNotFoundException;
import org.bson.types.ObjectId;

public final class Ids {

    private Ids() {
    }

    public static String newId() {
        return new ObjectId().toHexString();
    }

    public static void require(String id) {
        if (id == null || !ObjectId.isValid(id)) {
            throw new ResourceNotFoundException("Resource not found");
        }
    }

    public static String[] orderedPair(String left, String right) {
        if (left.compareTo(right) <= 0) {
            return new String[]{left, right};
        }
        return new String[]{right, left};
    }

    public static String conversationKey(String first, String second) {
        String[] pair = orderedPair(first, second);
        return pair[0] + ":" + pair[1];
    }
}
