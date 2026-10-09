package com.devconnect.socialnetwork.controller;

import com.devconnect.socialnetwork.dto.ApiResponse;
import com.devconnect.socialnetwork.dto.response.AttachmentCreatedResponse;
import com.devconnect.socialnetwork.security.SecurityUtils;
import com.devconnect.socialnetwork.service.AttachmentService;
import com.devconnect.socialnetwork.util.ApiResponses;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.InputStream;

@RestController
@Tag(name = "Attachments")
public class AttachmentController {

    private final AttachmentService attachmentService;

    public AttachmentController(AttachmentService attachmentService) {
        this.attachmentService = attachmentService;
    }

    @PostMapping(value = "/api/v1/conversations/{conversationId}/attachments", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Store ciphertext for a file the caller may send in this conversation")
    public ResponseEntity<ApiResponse<AttachmentCreatedResponse>> upload(
            @PathVariable String conversationId,
            @RequestParam("file") MultipartFile file
    ) {
        return ApiResponses.created("Attachment stored", attachmentService.upload(SecurityUtils.currentUserId(), conversationId, file));
    }

    @GetMapping("/api/v1/attachments/{attachmentId}")
    @Operation(summary = "Download ciphertext for an attachment the caller may see")
    public ResponseEntity<StreamingResponseBody> download(@PathVariable String attachmentId) {
        InputStream body = attachmentService.open(SecurityUtils.currentUserId(), attachmentId);
        StreamingResponseBody stream = output -> {
            try (InputStream input = body) {
                input.transferTo(output);
            }
        };
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"download\"")
                .header("X-Content-Type-Options", "nosniff")
                .body(stream);
    }
}
