package com.devconnect.socialnetwork.controller;

import com.devconnect.socialnetwork.dto.ApiResponse;
import com.devconnect.socialnetwork.dto.request.StoryReactionRequest;
import com.devconnect.socialnetwork.dto.response.StoryCardResponse;
import com.devconnect.socialnetwork.dto.response.StoryTrayResponse;
import com.devconnect.socialnetwork.dto.response.StoryViewerResponse;
import com.devconnect.socialnetwork.exception.ValidationFailedException;
import com.devconnect.socialnetwork.security.SecurityUtils;
import com.devconnect.socialnetwork.service.StoryMediaInspector;
import com.devconnect.socialnetwork.service.StoryService;
import com.devconnect.socialnetwork.util.ApiResponses;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;

@RestController
@Tag(name = "Stories")
public class StoryController {

    private final StoryService storyService;

    public StoryController(StoryService storyService) {
        this.storyService = storyService;
    }

    @GetMapping("/api/v1/stories")
    @Operation(summary = "Active stories for the caller and friends")
    public ResponseEntity<ApiResponse<StoryTrayResponse>> tray() {
        return ApiResponses.ok("Stories loaded", storyService.tray(SecurityUtils.currentUserId()));
    }

    @PostMapping(value = "/api/v1/stories", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Publish a story for friends")
    public ResponseEntity<ApiResponse<StoryCardResponse>> publish(
            @RequestParam String clientStoryId,
            @RequestParam(required = false) String caption,
            @RequestParam(required = false) String textStyle,
            @RequestParam("file") MultipartFile file
    ) throws IOException {
        if (file.getSize() > StoryMediaInspector.MAX_VIDEO_BYTES) {
            throw new ValidationFailedException("That file is too large for a story");
        }
        return ApiResponses.created(
                "Story published",
                storyService.publish(SecurityUtils.currentUserId(), clientStoryId, caption, textStyle, file.getBytes())
        );
    }

    @GetMapping("/api/v1/stories/{storyId}")
    @Operation(summary = "Load one active story the caller may see")
    public ResponseEntity<ApiResponse<StoryCardResponse>> get(@PathVariable String storyId) {
        return ApiResponses.ok("Story loaded", storyService.get(SecurityUtils.currentUserId(), storyId));
    }

    @GetMapping("/api/v1/stories/{storyId}/media")
    @Operation(summary = "Download story media the caller may see")
    public ResponseEntity<StreamingResponseBody> media(@PathVariable String storyId) {
        StoryService.OpenedMedia opened = storyService.openMedia(SecurityUtils.currentUserId(), storyId);
        StreamingResponseBody stream = output -> {
            try (InputStream input = opened.body()) {
                input.transferTo(output);
            }
        };
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(opened.contentType()))
                .contentLength(opened.size())
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"story\"")
                .header("X-Content-Type-Options", "nosniff")
                .header("Cache-Control", "private, max-age=300")
                .body(stream);
    }

    @PostMapping("/api/v1/stories/{storyId}/views")
    @Operation(summary = "Record one view of a story")
    public ResponseEntity<ApiResponse<StoryCardResponse>> view(@PathVariable String storyId) {
        return ApiResponses.ok("Story viewed", storyService.recordView(SecurityUtils.currentUserId(), storyId));
    }

    @GetMapping("/api/v1/stories/{storyId}/viewers")
    @Operation(summary = "List viewers of the caller's story")
    public ResponseEntity<ApiResponse<List<StoryViewerResponse>>> viewers(@PathVariable String storyId) {
        return ApiResponses.ok("Viewers loaded", storyService.viewers(SecurityUtils.currentUserId(), storyId));
    }

    @PostMapping("/api/v1/stories/{storyId}/reactions")
    @Operation(summary = "React to a friend's story")
    public ResponseEntity<ApiResponse<StoryCardResponse>> react(
            @PathVariable String storyId,
            @Valid @RequestBody StoryReactionRequest request
    ) {
        return ApiResponses.ok("Reaction saved", storyService.react(SecurityUtils.currentUserId(), storyId, request.emoji()));
    }

    @DeleteMapping("/api/v1/stories/{storyId}/reactions")
    @Operation(summary = "Remove the caller's reaction")
    public ResponseEntity<ApiResponse<StoryCardResponse>> clearReaction(@PathVariable String storyId) {
        return ApiResponses.ok("Reaction removed", storyService.clearReaction(SecurityUtils.currentUserId(), storyId));
    }

    @DeleteMapping("/api/v1/stories/{storyId}")
    @Operation(summary = "Delete the caller's story")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable String storyId) {
        storyService.delete(SecurityUtils.currentUserId(), storyId);
        return ApiResponses.ok("Story deleted", null);
    }
}
