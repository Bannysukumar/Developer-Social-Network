package com.trivexa.socialnetwork.dto.response;

import com.trivexa.socialnetwork.dto.PageResponse;

public record NotificationListResponse(
        PageResponse<NotificationResponse> page,
        long unreadCount
) {
}
