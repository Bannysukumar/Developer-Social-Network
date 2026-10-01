package com.trivexa.socialnetwork.controller;

import com.trivexa.socialnetwork.dto.ApiResponse;
import com.trivexa.socialnetwork.dto.PageResponse;
import com.trivexa.socialnetwork.dto.response.UserSummaryResponse;
import com.trivexa.socialnetwork.security.SecurityUtils;
import com.trivexa.socialnetwork.service.FriendshipService;
import com.trivexa.socialnetwork.util.ApiResponses;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/friends")
@Validated
@Tag(name = "Friends")
public class FriendController {

    private final FriendshipService friendshipService;

    public FriendController(FriendshipService friendshipService) {
        this.friendshipService = friendshipService;
    }

    @GetMapping
    @Operation(summary = "List accepted friends")
    public ResponseEntity<ApiResponse<PageResponse<UserSummaryResponse>>> list(
            @RequestParam(defaultValue = "0") @Min(0) @Max(1000) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(50) int size
    ) {
        return ApiResponses.ok("Friends retrieved", friendshipService.listFriends(SecurityUtils.currentUserId(), page, size));
    }

    @DeleteMapping("/{userId}")
    @Operation(summary = "Remove a friendship")
    public ResponseEntity<ApiResponse<Void>> remove(@PathVariable String userId) {
        friendshipService.removeFriend(SecurityUtils.currentUserId(), userId);
        return ApiResponses.ok("Friend removed", null);
    }
}
