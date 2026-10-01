package com.trivexa.socialnetwork.controller;

import com.trivexa.socialnetwork.dto.ApiResponse;
import com.trivexa.socialnetwork.dto.response.CountResponse;
import com.trivexa.socialnetwork.dto.response.NotificationListResponse;
import com.trivexa.socialnetwork.dto.response.NotificationResponse;
import com.trivexa.socialnetwork.security.SecurityUtils;
import com.trivexa.socialnetwork.service.NotificationService;
import com.trivexa.socialnetwork.util.ApiResponses;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/notifications")
@Validated
@Tag(name = "Notifications")
public class NotificationController {

    private final NotificationService notificationService;

    public NotificationController(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    @GetMapping
    @Operation(summary = "List notifications for the caller")
    public ResponseEntity<ApiResponse<NotificationListResponse>> list(
            @RequestParam(defaultValue = "0") @Min(0) @Max(1000) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(50) int size
    ) {
        return ApiResponses.ok("Notifications retrieved", notificationService.list(SecurityUtils.currentUserId(), page, size));
    }

    @PostMapping("/{notificationId}/read")
    @Operation(summary = "Mark one notification read")
    public ResponseEntity<ApiResponse<NotificationResponse>> read(@PathVariable String notificationId) {
        return ApiResponses.ok("Notification marked read", notificationService.markRead(SecurityUtils.currentUserId(), notificationId));
    }

    @PostMapping("/read-all")
    @Operation(summary = "Mark every unread notification read")
    public ResponseEntity<ApiResponse<CountResponse>> readAll() {
        return ApiResponses.ok("Notifications marked read", notificationService.markAllRead(SecurityUtils.currentUserId()));
    }
}
