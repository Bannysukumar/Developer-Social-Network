package com.devconnect.socialnetwork.dto.response;

import com.devconnect.socialnetwork.dto.PageResponse;

public record NotificationListResponse(
        PageResponse<NotificationResponse> page,
        long unreadCount
) {
}
