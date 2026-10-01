package com.devconnect.socialnetwork.controller;

import com.devconnect.socialnetwork.dto.ApiResponse;
import com.devconnect.socialnetwork.dto.request.RegisterIdentityKeyRequest;
import com.devconnect.socialnetwork.dto.request.RegisterPreKeysRequest;
import com.devconnect.socialnetwork.dto.response.DeviceResponse;
import com.devconnect.socialnetwork.dto.response.KeyBundleResponse;
import com.devconnect.socialnetwork.security.SecurityUtils;
import com.devconnect.socialnetwork.service.KeyDirectoryService;
import com.devconnect.socialnetwork.util.ApiResponses;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/keys")
@Tag(name = "Key directory")
public class KeyController {

    private final KeyDirectoryService keyDirectoryService;

    public KeyController(KeyDirectoryService keyDirectoryService) {
        this.keyDirectoryService = keyDirectoryService;
    }

    @PostMapping("/identity")
    @Operation(summary = "Register a public identity key for a device")
    public ResponseEntity<ApiResponse<DeviceResponse>> identity(@Valid @RequestBody RegisterIdentityKeyRequest request) {
        DeviceResponse response = keyDirectoryService.registerIdentity(SecurityUtils.currentUserId(), request);
        return ApiResponses.ok("Identity key registered", response);
    }

    @PostMapping("/prekeys")
    @Operation(summary = "Upload a signed prekey and one-time prekeys")
    public ResponseEntity<ApiResponse<Void>> prekeys(@Valid @RequestBody RegisterPreKeysRequest request) {
        keyDirectoryService.registerPreKeys(SecurityUtils.currentUserId(), request);
        return ApiResponses.ok("Prekeys stored", null);
    }

    @GetMapping("/{userId}")
    @Operation(summary = "Fetch public key bundles for a friend. One-time prekeys are consumed.")
    public ResponseEntity<ApiResponse<KeyBundleResponse>> bundle(@PathVariable String userId) {
        return ApiResponses.ok("Key bundle retrieved", keyDirectoryService.bundle(SecurityUtils.currentUserId(), userId));
    }

    @DeleteMapping("/devices/{deviceId}")
    @Operation(summary = "Revoke a device and delete its public key material")
    public ResponseEntity<ApiResponse<Void>> revoke(@PathVariable String deviceId) {
        keyDirectoryService.revokeDevice(SecurityUtils.currentUserId(), deviceId);
        return ApiResponses.ok("Device keys revoked", null);
    }
}
