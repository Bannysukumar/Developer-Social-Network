package com.devconnect.socialnetwork.dto;

import java.util.List;

public record CursorPageResponse<T>(
        List<T> items,
        String nextCursor,
        boolean hasNext
) {
}
