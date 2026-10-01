package com.trivexa.socialnetwork.controller;

import com.trivexa.socialnetwork.dto.ApiResponse;
import com.trivexa.socialnetwork.dto.PageResponse;
import com.trivexa.socialnetwork.dto.request.DeleteAccountRequest;
import com.trivexa.socialnetwork.dto.request.ReplaceProfileRequest;
import com.trivexa.socialnetwork.dto.request.UpdateProfileRequest;
import com.trivexa.socialnetwork.dto.response.BlockStatusResponse;
import com.trivexa.socialnetwork.dto.response.UserProfileResponse;
import com.trivexa.socialnetwork.dto.response.UserSummaryResponse;
import com.trivexa.socialnetwork.entity.StoredFileEntity;
import com.trivexa.socialnetwork.security.SecurityUtils;
import com.trivexa.socialnetwork.service.BlockService;
import com.trivexa.socialnetwork.service.FileStorageService;
import com.trivexa.socialnetwork.service.UserService;
import com.trivexa.socialnetwork.util.ApiResponses;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;

@RestController
@RequestMapping("/api/v1")
@Validated
@Tag(name = "Users")
public class UserController {

    private final UserService userService;
    private final BlockService blockService;
    private final FileStorageService fileStorageService;

    public UserController(UserService userService, BlockService blockService, FileStorageService fileStorageService) {
        this.userService = userService;
        this.blockService = blockService;
        this.fileStorageService = fileStorageService;
    }

    @GetMapping("/users/me")
    @Operation(summary = "Get the authenticated profile")
    public ResponseEntity<ApiResponse<UserProfileResponse>> me() {
        return ApiResponses.ok("Profile retrieved", userService.me(SecurityUtils.currentUserId()));
    }

    @PutMapping("/users/me")
    @Operation(summary = "Replace editable profile fields")
    public ResponseEntity<ApiResponse<UserProfileResponse>> replace(@Valid @RequestBody ReplaceProfileRequest request) {
        return ApiResponses.ok("Profile updated", userService.replace(SecurityUtils.currentUserId(), request));
    }

    @PatchMapping("/users/me")
    @Operation(summary = "Update editable profile fields")
    public ResponseEntity<ApiResponse<UserProfileResponse>> patch(@Valid @RequestBody UpdateProfileRequest request) {
        return ApiResponses.ok("Profile updated", userService.patch(SecurityUtils.currentUserId(), request));
    }

    @PostMapping(value = "/users/me/avatar", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Upload a JPEG, PNG, or WebP profile image")
    public ResponseEntity<ApiResponse<UserProfileResponse>> avatar(@RequestPart("file") MultipartFile file) throws IOException {
        return ApiResponses.ok("Profile image updated", userService.storeAvatar(SecurityUtils.currentUserId(), file.getBytes()));
    }

    @DeleteMapping("/users/me")
    @Operation(summary = "Anonymize and deactivate the authenticated account")
    public ResponseEntity<ApiResponse<Void>> deleteMe(@Valid @RequestBody DeleteAccountRequest request) {
        userService.deleteMe(SecurityUtils.currentUserId(), request);
        return ApiResponses.ok("Account deleted", null);
    }

    @GetMapping("/users/search")
    @Operation(summary = "Search users by username or display name")
    public ResponseEntity<ApiResponse<PageResponse<UserSummaryResponse>>> search(
            @RequestParam @NotBlank @Size(min = 2, max = 50) String q,
            @RequestParam(defaultValue = "0") @Min(0) @Max(1000) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(20) int size
    ) {
        return ApiResponses.ok("Search completed", userService.search(SecurityUtils.currentUserId(), q, page, size));
    }

    @GetMapping("/users/{userId}")
    @Operation(summary = "Get a profile that the caller is allowed to see")
    public ResponseEntity<ApiResponse<UserProfileResponse>> profile(@PathVariable String userId) {
        return ApiResponses.ok("Profile retrieved", userService.profile(SecurityUtils.currentUserId(), userId));
    }

    @PostMapping("/users/{userId}/block")
    @Operation(summary = "Block a user")
    public ResponseEntity<ApiResponse<BlockStatusResponse>> block(@PathVariable String userId) {
        return ApiResponses.ok("User blocked", blockService.block(SecurityUtils.currentUserId(), userId));
    }

    @DeleteMapping("/users/{userId}/block")
    @Operation(summary = "Remove a block created by the caller")
    public ResponseEntity<ApiResponse<BlockStatusResponse>> unblock(@PathVariable String userId) {
        return ApiResponses.ok("User unblocked", blockService.unblock(SecurityUtils.currentUserId(), userId));
    }

    @GetMapping("/users/{userId}/block-status")
    @Operation(summary = "Read the block relationship with a user")
    public ResponseEntity<ApiResponse<BlockStatusResponse>> blockStatus(@PathVariable String userId) {
        return ApiResponses.ok("Block status retrieved", blockService.status(SecurityUtils.currentUserId(), userId));
    }

    @GetMapping("/media/{fileId}")
    @Operation(summary = "Download a profile image the caller is allowed to see")
    public ResponseEntity<byte[]> media(@PathVariable String fileId) throws IOException {
        StoredFileEntity file = userService.mediaForViewer(SecurityUtils.currentUserId(), fileId);
        try (InputStream input = fileStorageService.open(file)) {
            return ResponseEntity.ok()
                    .contentType(MediaType.parseMediaType(file.getContentType()))
                    .cacheControl(CacheControl.noCache().cachePrivate())
                    .body(input.readAllBytes());
        }
    }
}
