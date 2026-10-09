package com.devconnect.socialnetwork.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.devconnect.socialnetwork.dto.request.SendMessageRequest;
import com.devconnect.socialnetwork.exception.ApiException;
import com.devconnect.socialnetwork.exception.ErrorCode;
import com.devconnect.socialnetwork.service.MessageService;
import com.devconnect.socialnetwork.service.PresenceService;
import com.devconnect.socialnetwork.service.TypingService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.LinkedHashMap;
import java.util.Map;

@Component
public class ChatWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(ChatWebSocketHandler.class);

    private final MessageService messageService;
    private final WebSocketSessionRegistry registry;
    private final PresenceService presenceService;
    private final TypingService typingService;
    private final ObjectMapper objectMapper;

    public ChatWebSocketHandler(
            MessageService messageService,
            WebSocketSessionRegistry registry,
            PresenceService presenceService,
            TypingService typingService,
            ObjectMapper objectMapper
    ) {
        this.messageService = messageService;
        this.registry = registry;
        this.presenceService = presenceService;
        this.typingService = typingService;
        this.objectMapper = objectMapper;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        String userId = userId(session);
        if (userId == null) {
            session.close(CloseStatus.POLICY_VIOLATION);
            return;
        }
        registry.add(userId, session);
        presenceService.connected(userId);
        send(session, frame("READY", Map.of("userId", userId)));
        messageService.deliverPending(userId);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        String userId = userId(session);
        if (userId == null) {
            session.close(CloseStatus.POLICY_VIOLATION);
            return;
        }
        ClientFrame clientFrame;
        try {
            clientFrame = objectMapper.readValue(message.getPayload(), ClientFrame.class);
        } catch (Exception ex) {
            send(session, frame("ERROR", Map.of("errorCode", ErrorCode.MALFORMED_REQUEST.name(), "message", "Message payload is invalid")));
            return;
        }
        if (clientFrame.getType() == null) {
            send(session, frame("ERROR", Map.of("errorCode", ErrorCode.VALIDATION_ERROR.name(), "message", "Message type is required")));
            return;
        }
        try {
            switch (clientFrame.getType()) {
                case "PING" -> {
                    registry.touch(session);
                    send(session, frame("PONG", Map.of()));
                }
                case "TYPING_START" -> typingService.publish(userId, clientFrame.getConversationId(), true);
                case "TYPING_STOP" -> typingService.publish(userId, clientFrame.getConversationId(), false);
                case "SEND" -> messageService.send(userId, clientFrame.getConversationId(), new SendMessageRequest(
                        clientFrame.getCiphertext(),
                        clientFrame.getMessageType(),
                        clientFrame.getClientMessageId(),
                        clientFrame.getDeviceId(),
                        clientFrame.getKeyId(),
                        clientFrame.getAttachmentIds()
                ));
                case "DELIVERED" -> messageService.markDelivered(userId, clientFrame.getMessageId());
                case "READ" -> messageService.markRead(userId, clientFrame.getMessageId());
                default -> send(session, frame("ERROR", Map.of("errorCode", ErrorCode.VALIDATION_ERROR.name(), "message", "Message type is not supported")));
            }
        } catch (ApiException ex) {
            send(session, frame("ERROR", Map.of("errorCode", ex.getErrorCode().name(), "message", ex.getMessage())));
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        String userId = userId(session);
        if (userId != null) {
            registry.remove(userId, session);
            presenceService.disconnected(userId);
        }
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        log.warn("WebSocket transport error");
    }

    private String userId(WebSocketSession session) {
        Object value = session.getAttributes().get("userId");
        return value instanceof String id ? id : null;
    }

    private void send(WebSocketSession session, String json) {
        if (!session.isOpen()) {
            return;
        }
        try {
            synchronized (session) {
                session.sendMessage(new TextMessage(json));
            }
        } catch (Exception ex) {
            log.warn("WebSocket response failed");
        }
    }

    private String frame(String type, Map<String, ?> data) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("type", type);
        body.put("data", data);
        return objectMapper.writeValueAsString(body);
    }
}
