package com.devconnect.socialnetwork.mapper;

import com.devconnect.socialnetwork.dto.response.MessageAck;
import com.devconnect.socialnetwork.dto.response.MessageResponse;
import com.devconnect.socialnetwork.entity.MessageEntity;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class MessageMapper {

    public MessageResponse toResponse(MessageEntity message) {
        boolean cleared = message.isDeletedForEveryone();
        List<String> attachments = message.getAttachmentIds() == null ? List.of() : List.copyOf(message.getAttachmentIds());
        return new MessageResponse(
                message.getId(),
                message.getConversationId(),
                message.getSenderId(),
                message.getRecipientId(),
                cleared ? "" : message.getCiphertext(),
                message.getMessageType(),
                message.getStatus(),
                message.getDeviceId(),
                message.getKeyId(),
                message.getCreatedAt(),
                message.getDeliveredAt(),
                message.getReadAt(),
                message.isDeletedForEveryone(),
                cleared ? List.of() : attachments
        );
    }

    public MessageAck toAck(MessageEntity message) {
        return new MessageAck(
                message.getId(),
                message.getConversationId(),
                message.getStatus(),
                message.getDeliveredAt(),
                message.getReadAt()
        );
    }
}
