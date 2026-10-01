package com.devconnect.socialnetwork.controller;

import com.devconnect.socialnetwork.dto.ApiResponse;
import com.devconnect.socialnetwork.dto.PageResponse;
import com.devconnect.socialnetwork.dto.WriteResult;
import com.devconnect.socialnetwork.dto.response.FriendRequestResponse;
import com.devconnect.socialnetwork.security.SecurityUtils;
import com.devconnect.socialnetwork.service.FriendRequestService;
import com.devconnect.socialnetwork.util.ApiResponses;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/friend-requests")
@Validated
@Tag(name = "Friend requests")
public class FriendRequestController {

    private final FriendRequestService friendRequestService;

    public FriendRequestController(FriendRequestService friendRequestService) {
        this.friendRequestService = friendRequestService;
    }

    @PostMapping("/{userId}")
    @Operation(summary = "Send a friend request")
    public ResponseEntity<ApiResponse<FriendRequestResponse>> send(@PathVariable String userId) {
        WriteResult<FriendRequestResponse> result = friendRequestService.send(SecurityUtils.currentUserId(), userId);
        return ApiResponses.of(result.created(), "Friend request sent", "Friend request already pending", result.body());
    }

    @GetMapping("/incoming")
    @Operation(summary = "List incoming pending friend requests")
    public ResponseEntity<ApiResponse<PageResponse<FriendRequestResponse>>> incoming(
            @RequestParam(defaultValue = "0") @Min(0) @Max(1000) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(50) int size
    ) {
        return ApiResponses.ok("Incoming requests retrieved", friendRequestService.incoming(SecurityUtils.currentUserId(), page, size));
    }

    @GetMapping("/outgoing")
    @Operation(summary = "List outgoing pending friend requests")
    public ResponseEntity<ApiResponse<PageResponse<FriendRequestResponse>>> outgoing(
            @RequestParam(defaultValue = "0") @Min(0) @Max(1000) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(50) int size
    ) {
        return ApiResponses.ok("Outgoing requests retrieved", friendRequestService.outgoing(SecurityUtils.currentUserId(), page, size));
    }

    @PostMapping("/{requestId}/accept")
    @Operation(summary = "Accept a friend request addressed to the caller")
    public ResponseEntity<ApiResponse<FriendRequestResponse>> accept(@PathVariable String requestId) {
        return ApiResponses.ok("Friend request accepted", friendRequestService.accept(SecurityUtils.currentUserId(), requestId));
    }

    @PostMapping("/{requestId}/reject")
    @Operation(summary = "Reject a friend request addressed to the caller")
    public ResponseEntity<ApiResponse<FriendRequestResponse>> reject(@PathVariable String requestId) {
        return ApiResponses.ok("Friend request rejected", friendRequestService.reject(SecurityUtils.currentUserId(), requestId));
    }

    @DeleteMapping("/{requestId}")
    @Operation(summary = "Cancel a friend request sent by the caller")
    public ResponseEntity<ApiResponse<FriendRequestResponse>> cancel(@PathVariable String requestId) {
        return ApiResponses.ok("Friend request cancelled", friendRequestService.cancel(SecurityUtils.currentUserId(), requestId));
    }
}
