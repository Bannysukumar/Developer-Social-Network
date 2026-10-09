package com.devconnect.socialnetwork.controller;

import com.devconnect.socialnetwork.dto.ApiResponse;
import com.devconnect.socialnetwork.dto.CursorPageResponse;
import com.devconnect.socialnetwork.dto.PageResponse;
import com.devconnect.socialnetwork.dto.WriteResult;
import com.devconnect.socialnetwork.dto.request.CreateConversationRequest;
import com.devconnect.socialnetwork.dto.request.SendMessageRequest;
import com.devconnect.socialnetwork.dto.response.ConversationResponse;
import com.devconnect.socialnetwork.dto.response.MessageResponse;
import com.devconnect.socialnetwork.security.SecurityUtils;
import com.devconnect.socialnetwork.service.ConversationService;
import com.devconnect.socialnetwork.service.MessageService;
import com.devconnect.socialnetwork.util.ApiResponses;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/conversations")
@Validated
@Tag(name = "Conversations")
public class ConversationController {

    private final ConversationService conversationService;
    private final MessageService messageService;

    public ConversationController(ConversationService conversationService, MessageService messageService) {
        this.conversationService = conversationService;
        this.messageService = messageService;
    }

    @PostMapping
    @Operation(summary = "Create or return the one-to-one conversation with a friend")
    public ResponseEntity<ApiResponse<ConversationResponse>> create(@Valid @RequestBody CreateConversationRequest request) {
        WriteResult<ConversationResponse> result = conversationService.create(SecurityUtils.currentUserId(), request.participantId());
        return ApiResponses.of(result.created(), "Conversation created", "Conversation already exists", result.body());
    }

    @GetMapping
    @Operation(summary = "List conversations for the caller")
    public ResponseEntity<ApiResponse<PageResponse<ConversationResponse>>> list(
            @RequestParam(defaultValue = "0") @Min(0) @Max(1000) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(50) int size
    ) {
        return ApiResponses.ok("Conversations retrieved", conversationService.list(SecurityUtils.currentUserId(), page, size));
    }

    @GetMapping("/{conversationId}")
    @Operation(summary = "Get a conversation the caller belongs to")
    public ResponseEntity<ApiResponse<ConversationResponse>> get(@PathVariable String conversationId) {
        return ApiResponses.ok("Conversation retrieved", conversationService.get(SecurityUtils.currentUserId(), conversationId));
    }

    @GetMapping("/{conversationId}/messages")
    @Operation(summary = "List ciphertext messages, newest first")
    public ResponseEntity<ApiResponse<CursorPageResponse<MessageResponse>>> messages(
            @PathVariable String conversationId,
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "30") @Min(1) @Max(50) int limit
    ) {
        return ApiResponses.ok("Messages retrieved", messageService.list(SecurityUtils.currentUserId(), conversationId, cursor, limit));
    }

    @PostMapping("/{conversationId}/read")
    @Operation(summary = "Mark the caller's unread incoming messages in this conversation as read")
    public ResponseEntity<ApiResponse<com.devconnect.socialnetwork.dto.response.CountResponse>> read(
            @PathVariable String conversationId
    ) {
        int updated = messageService.markConversationRead(SecurityUtils.currentUserId(), conversationId);
        return ApiResponses.ok("Messages marked read", new com.devconnect.socialnetwork.dto.response.CountResponse(updated));
    }

    @PostMapping("/{conversationId}/messages")
    @Operation(summary = "Store a client-encrypted message")
    public ResponseEntity<ApiResponse<MessageResponse>> send(
            @PathVariable String conversationId,
            @Valid @RequestBody SendMessageRequest request
    ) {
        WriteResult<MessageResponse> result = messageService.send(SecurityUtils.currentUserId(), conversationId, request);
        return ApiResponses.of(result.created(), "Message stored", "Message already stored", result.body());
    }
}
