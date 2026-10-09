package com.devconnect.socialnetwork.service;

import com.devconnect.socialnetwork.config.AppProperties;
import com.devconnect.socialnetwork.dto.response.AttachmentCreatedResponse;
import com.devconnect.socialnetwork.entity.AttachmentEntity;
import com.devconnect.socialnetwork.entity.ConversationEntity;
import com.devconnect.socialnetwork.entity.MessageEntity;
import com.devconnect.socialnetwork.exception.ForbiddenException;
import com.devconnect.socialnetwork.exception.ResourceNotFoundException;
import com.devconnect.socialnetwork.exception.ValidationFailedException;
import com.devconnect.socialnetwork.repository.AttachmentRepository;
import com.devconnect.socialnetwork.repository.MessageRepository;
import com.devconnect.socialnetwork.util.Ids;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@Service
public class AttachmentService {

    private final AttachmentRepository repository;
    private final MessageRepository messageRepository;
    private final ConversationService conversationService;
    private final FriendshipService friendshipService;
    private final BlockService blockService;
    private final FileStorageService fileStorageService;
    private final AppProperties properties;
    private final Clock clock;

    public AttachmentService(
            AttachmentRepository repository,
            MessageRepository messageRepository,
            ConversationService conversationService,
            FriendshipService friendshipService,
            BlockService blockService,
            FileStorageService fileStorageService,
            AppProperties properties,
            Clock clock
    ) {
        this.repository = repository;
        this.messageRepository = messageRepository;
        this.conversationService = conversationService;
        this.friendshipService = friendshipService;
        this.blockService = blockService;
        this.fileStorageService = fileStorageService;
        this.properties = properties;
        this.clock = clock;
    }

    public AttachmentCreatedResponse upload(String userId, String conversationId, InputStream input, long declaredSize) {
        if (input == null) {
            throw new ValidationFailedException("File size is not allowed");
        }
        assertCanSend(userId, conversationId);
        FileStorageService.StoredObject stored = fileStorageService.storeOpaque(input, declaredSize);
        AttachmentEntity entity = new AttachmentEntity();
        entity.setId(Ids.newId());
        entity.setOwnerId(userId);
        entity.setConversationId(conversationId);
        entity.setSize(stored.size());
        entity.setStorageKey(stored.storageKey());
        entity.setCreatedAt(clock.instant());
        repository.save(entity);
        return new AttachmentCreatedResponse(entity.getId(), entity.getSize());
    }

    public OpenedAttachment open(String userId, String attachmentId) {
        AttachmentEntity attachment = require(attachmentId);
        conversationService.requireMember(userId, attachment.getConversationId());
        if (attachment.getMessageId() == null) {
            if (!attachment.getOwnerId().equals(userId)) {
                throw new ResourceNotFoundException("Resource not found");
            }
        } else {
            MessageEntity message = messageRepository.findById(attachment.getMessageId())
                    .orElseThrow(() -> new ResourceNotFoundException("Resource not found"));
            if (message.isDeletedForEveryone()
                    || (message.getDeletedForUserIds() != null && message.getDeletedForUserIds().contains(userId))
                    || (!message.getSenderId().equals(userId) && !message.getRecipientId().equals(userId))) {
                throw new ResourceNotFoundException("Resource not found");
            }
        }
        return new OpenedAttachment(fileStorageService.sizeKey(attachment.getStorageKey()), fileStorageService.openKey(attachment.getStorageKey()));
    }

    public record OpenedAttachment(long size, InputStream body) {
    }

    public void reserve(String userId, String conversationId, List<String> attachmentIds) {
        int max = properties.getStorage().getMaxAttachmentsPerMessage();
        if (attachmentIds.size() > max) {
            throw new ValidationFailedException("Too many files");
        }
        Set<String> seen = new LinkedHashSet<>();
        for (String attachmentId : attachmentIds) {
            if (!seen.add(attachmentId)) {
                throw new ValidationFailedException("A file was selected more than once");
            }
            AttachmentEntity attachment = require(attachmentId);
            if (!attachment.getOwnerId().equals(userId) || !attachment.getConversationId().equals(conversationId)) {
                throw new ResourceNotFoundException("Resource not found");
            }
            if (attachment.getMessageId() != null) {
                throw new ValidationFailedException("That file was already sent");
            }
        }
    }

    public void bind(String messageId, List<String> attachmentIds) {
        for (String attachmentId : attachmentIds) {
            AttachmentEntity attachment = require(attachmentId);
            attachment.setMessageId(messageId);
            repository.save(attachment);
        }
    }

    public void deleteBound(List<String> attachmentIds) {
        if (attachmentIds == null) {
            return;
        }
        for (String attachmentId : attachmentIds) {
            repository.findById(attachmentId).ifPresent(attachment -> {
                fileStorageService.deleteKey(attachment.getStorageKey());
                repository.delete(attachment);
            });
        }
    }

    public void purgeUnbound(Duration age) {
        Instant cutoff = clock.instant().minus(age);
        for (AttachmentEntity attachment : repository.findByMessageIdIsNullAndCreatedAtBefore(cutoff)) {
            fileStorageService.deleteKey(attachment.getStorageKey());
            repository.delete(attachment);
        }
    }

    private void assertCanSend(String userId, String conversationId) {
        ConversationEntity conversation = conversationService.requireMember(userId, conversationId);
        String otherId = conversation.otherParticipant(userId);
        blockService.assertCanInteract(userId, otherId);
        if (!friendshipService.areFriends(userId, otherId)) {
            throw new ForbiddenException("Only friends can exchange messages");
        }
    }

    private AttachmentEntity require(String attachmentId) {
        Ids.require(attachmentId);
        return repository.findById(attachmentId)
                .orElseThrow(() -> new ResourceNotFoundException("Resource not found"));
    }
}
