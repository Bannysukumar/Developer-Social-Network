package com.devconnect.socialnetwork.controller;

import com.devconnect.socialnetwork.dto.ApiResponse;
import com.devconnect.socialnetwork.dto.response.DeviceResponse;
import com.devconnect.socialnetwork.security.SecurityUtils;
import com.devconnect.socialnetwork.service.DeviceService;
import com.devconnect.socialnetwork.util.ApiResponses;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/devices")
@Tag(name = "Devices")
public class DeviceController {

    private final DeviceService deviceService;

    public DeviceController(DeviceService deviceService) {
        this.deviceService = deviceService;
    }

    @GetMapping
    @Operation(summary = "List the caller's devices")
    public ResponseEntity<ApiResponse<List<DeviceResponse>>> list(
            @RequestParam(defaultValue = "false") boolean includeRevoked
    ) {
        return ApiResponses.ok("Devices retrieved", deviceService.list(SecurityUtils.currentUserId(), includeRevoked));
    }

    @DeleteMapping("/{deviceId}")
    @Operation(summary = "Revoke a device, its public keys, and its refresh tokens")
    public ResponseEntity<ApiResponse<Void>> revoke(@PathVariable String deviceId) {
        deviceService.revoke(SecurityUtils.currentUserId(), deviceId);
        return ApiResponses.ok("Device revoked", null);
    }
}
