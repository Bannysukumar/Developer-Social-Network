package com.devconnect.socialnetwork.controller;

import com.devconnect.socialnetwork.domain.DeletionScope;
import com.devconnect.socialnetwork.dto.ApiResponse;
import com.devconnect.socialnetwork.dto.response.MessageAck;
import com.devconnect.socialnetwork.dto.response.MessageResponse;
import com.devconnect.socialnetwork.security.SecurityUtils;
import com.devconnect.socialnetwork.service.MessageService;
import com.devconnect.socialnetwork.util.ApiResponses;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/messages")
@Tag(name = "Messages")
public class MessageController {

    private final MessageService messageService;

    public MessageController(MessageService messageService) {
        this.messageService = messageService;
    }

    @PatchMapping("/{messageId}/read")
    @Operation(summary = "Mark a message read as its recipient")
    public ResponseEntity<ApiResponse<MessageAck>> read(@PathVariable String messageId) {
        return ApiResponses.ok("Message marked read", messageService.markRead(SecurityUtils.currentUserId(), messageId));
    }

    @DeleteMapping("/{messageId}")
    @Operation(summary = "Hide a message for the caller, or clear server ciphertext for everyone when scope=everyone")
    public ResponseEntity<ApiResponse<MessageResponse>> delete(
            @PathVariable String messageId,
            @RequestParam(defaultValue = "me") DeletionScope scope
    ) {
        return ApiResponses.ok("Message deletion recorded", messageService.delete(SecurityUtils.currentUserId(), messageId, scope));
    }
}
