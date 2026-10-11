package com.devconnect.socialnetwork.controller;

import com.devconnect.socialnetwork.dto.ApiResponse;
import com.devconnect.socialnetwork.dto.request.ReactionRequest;
import com.devconnect.socialnetwork.dto.response.ReactionSnapshot;
import com.devconnect.socialnetwork.security.SecurityUtils;
import com.devconnect.socialnetwork.service.ReactionService;
import com.devconnect.socialnetwork.util.ApiResponses;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/conversations/{conversationId}/messages/{messageId}/reaction")
@Tag(name = "Reactions")
public class ReactionController {

    private final ReactionService reactionService;

    public ReactionController(ReactionService reactionService) {
        this.reactionService = reactionService;
    }

    @PutMapping
    @Operation(summary = "Set the caller's one reaction on a message they can access")
    public ResponseEntity<ApiResponse<ReactionSnapshot>> set(
            @PathVariable String conversationId,
            @PathVariable String messageId,
            @Valid @RequestBody ReactionRequest request
    ) {
        return ApiResponses.ok(
                "Reaction saved",
                reactionService.set(SecurityUtils.currentUserId(), conversationId, messageId, request.emoji())
        );
    }

    @DeleteMapping
    @Operation(summary = "Remove the caller's reaction from a message they can access")
    public ResponseEntity<ApiResponse<ReactionSnapshot>> clear(
            @PathVariable String conversationId,
            @PathVariable String messageId
    ) {
        return ApiResponses.ok(
                "Reaction removed",
                reactionService.clear(SecurityUtils.currentUserId(), conversationId, messageId)
        );
    }
}
