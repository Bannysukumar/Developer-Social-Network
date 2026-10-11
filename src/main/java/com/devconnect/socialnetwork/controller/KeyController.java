package com.devconnect.socialnetwork.controller;

import com.devconnect.socialnetwork.dto.ApiResponse;
import com.devconnect.socialnetwork.dto.request.KeyBackupRequest;
import com.devconnect.socialnetwork.dto.request.RegisterIdentityKeyRequest;
import com.devconnect.socialnetwork.dto.request.RegisterPreKeysRequest;
import com.devconnect.socialnetwork.dto.response.DeviceResponse;
import com.devconnect.socialnetwork.dto.response.KeyBackupResponse;
import com.devconnect.socialnetwork.dto.response.KeyBundleResponse;
import com.devconnect.socialnetwork.security.SecurityUtils;
import com.devconnect.socialnetwork.service.KeyBackupService;
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
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/keys")
@Tag(name = "Key directory")
public class KeyController {

    private final KeyDirectoryService keyDirectoryService;
    private final KeyBackupService keyBackupService;

    public KeyController(KeyDirectoryService keyDirectoryService, KeyBackupService keyBackupService) {
        this.keyDirectoryService = keyDirectoryService;
        this.keyBackupService = keyBackupService;
    }

    @GetMapping("/backup")
    @Operation(summary = "Fetch this account's encrypted device-key backup. The server cannot read the key.")
    public ResponseEntity<ApiResponse<KeyBackupResponse>> backup() {
        return ApiResponses.ok("Key backup retrieved", keyBackupService.find(SecurityUtils.currentUserId()));
    }

    @PutMapping("/backup")
    @Operation(summary = "Store this account's encrypted device-key backup")
    public ResponseEntity<ApiResponse<KeyBackupResponse>> saveBackup(@Valid @RequestBody KeyBackupRequest request) {
        return ApiResponses.ok("Key backup stored", keyBackupService.save(SecurityUtils.currentUserId(), request));
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
