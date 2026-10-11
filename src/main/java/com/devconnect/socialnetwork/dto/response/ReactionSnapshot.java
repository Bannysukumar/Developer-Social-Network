package com.devconnect.socialnetwork.dto.response;

import java.util.List;

public record ReactionSnapshot(
        String messageId,
        String conversationId,
        List<ReactionMark> items
) {
}
