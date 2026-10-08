package com.devconnect.socialnetwork;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.bson.Document;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.net.URI;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Real sockets against the test profile. Signup rate limiting stays disabled only in that profile.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@Timeout(value = 12, unit = TimeUnit.MINUTES)
class PresenceRealtimeIntegrationTest extends AbstractIntegrationTest {

    private static final long GRACE_WAIT_MS = 23_000;

    @LocalServerPort
    private int port;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private MongoTemplate mongoTemplate;

    private final List<WebSocketSession> sessions = new ArrayList<>();
    private final StandardWebSocketClient client = new StandardWebSocketClient();

    @BeforeEach
    void setUp() {
        cleanDatabase();
    }

    @AfterEach
    void closeSockets() {
        for (WebSocketSession session : sessions) {
            try {
                if (session.isOpen()) {
                    session.close();
                }
            } catch (Exception ignored) {
                // The test has already recorded the result.
            }
        }
        sessions.clear();
    }

    @Test
    void reconnectDuringGraceDoesNotEmitOffline() throws Exception {
        Account ada = account("ada");
        Account grace = account("grace");
        befriend(ada, grace);
        Socket graceSocket = open(grace.token);
        Socket adaSocket = open(ada.token);
        assertThat(awaitStatus(graceSocket, ada.id, "ONLINE", 5)).isTrue();
        adaSocket.session.close();
        Socket replacement = open(ada.token);
        sleep(GRACE_WAIT_MS);
        assertThat(countStatus(drain(graceSocket), ada.id, "OFFLINE")).isZero();
        assertThat(presenceStatus(grace.token, ada.id)).isEqualTo("ONLINE");
        assertThat(lastSeen(ada.id)).isNull();
        replacement.session.close();
    }

    @Test
    void finalSocketGoesOfflineOnce() throws Exception {
        Account ada = account("ada");
        Account grace = account("grace");
        befriend(ada, grace);
        Socket graceSocket = open(grace.token);
        Socket adaSocket = open(ada.token);
        assertThat(awaitStatus(graceSocket, ada.id, "ONLINE", 5)).isTrue();
        adaSocket.session.close();
        sleep(GRACE_WAIT_MS);
        List<String> frames = drain(graceSocket);
        assertThat(countStatus(frames, ada.id, "OFFLINE")).isEqualTo(1);
        String seen = presenceNode(grace.token, ada.id).path("lastSeenAt").asText();
        assertThat(seen).isNotBlank();
        assertThat(String.join("\n", frames)).contains(seen.substring(0, seen.length() - 1));
        int seenFrames = graceSocket.frames.size();
        sleep(5_000);
        drain(graceSocket);
        assertThat(countStatus(graceSocket.frames.subList(seenFrames, graceSocket.frames.size()), ada.id, "OFFLINE")).isZero();
        assertThat(presenceNode(grace.token, ada.id).path("lastSeenAt").asText()).isEqualTo(seen);
        assertThat(presenceStatus(grace.token, ada.id)).isEqualTo("OFFLINE");
    }

    @Test
    void secondSocketKeepsTheAccountOnline() throws Exception {
        Account ada = account("ada");
        Account grace = account("grace");
        befriend(ada, grace);
        Socket graceSocket = open(grace.token);
        Socket first = open(ada.token);
        Socket second = open(ada.token);
        assertThat(awaitStatus(graceSocket, ada.id, "ONLINE", 5)).isTrue();
        drain(graceSocket);
        first.session.close();
        sleep(GRACE_WAIT_MS);
        assertThat(countStatus(drain(graceSocket), ada.id, "OFFLINE")).isZero();
        assertThat(presenceStatus(grace.token, ada.id)).isEqualTo("ONLINE");
        second.session.close();
        sleep(GRACE_WAIT_MS);
        assertThat(countStatus(drain(graceSocket), ada.id, "OFFLINE")).isEqualTo(1);
        assertThat(lastSeen(ada.id)).isNotBlank();
    }

    @Test
    void heartbeatsDoNotMarkTheUserOfflineOrWriteLastSeen() throws Exception {
        Account ada = account("ada");
        Account grace = account("grace");
        befriend(ada, grace);
        Socket graceSocket = open(grace.token);
        Socket adaSocket = open(ada.token);
        assertThat(awaitStatus(graceSocket, ada.id, "ONLINE", 5)).isTrue();
        Object updatedAt = mongoTemplate.findById(ada.id, Document.class, "users").get("updatedAt");
        long started = System.nanoTime();
        for (int second : new int[] {25, 50, 75, 100}) {
            long remaining = second * 1000L - TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);
            if (remaining > 0) {
                sleep(remaining);
            }
            adaSocket.session.sendMessage(new TextMessage("{\"type\":\"PING\"}"));
            assertThat(awaitType(adaSocket, "PONG", 5)).isTrue();
        }
        assertThat(countStatus(drain(graceSocket), ada.id, "OFFLINE")).isZero();
        assertThat(presenceStatus(grace.token, ada.id)).isEqualTo("ONLINE");
        assertThat(lastSeen(ada.id)).isNull();
        assertThat(mongoTemplate.findById(ada.id, Document.class, "users").get("updatedAt")).isEqualTo(updatedAt);
    }

    @Test
    void missedHeartbeatGoesOfflineAndReconnectsOnce() throws Exception {
        Account ada = account("ada");
        Account grace = account("grace");
        befriend(ada, grace);
        Socket graceSocket = open(grace.token);
        Socket adaSocket = open(ada.token);
        assertThat(awaitStatus(graceSocket, ada.id, "ONLINE", 5)).isTrue();
        drain(graceSocket);
        int marked = graceSocket.frames.size();
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(130);
        while (adaSocket.session.isOpen() && System.nanoTime() < deadline) {
            graceSocket.session.sendMessage(new TextMessage("{\"type\":\"PING\"}"));
            sleep(2_000);
        }
        assertThat(adaSocket.session.isOpen()).isFalse();
        sleep(GRACE_WAIT_MS);
        drain(graceSocket);
        List<String> offline = graceSocket.frames.subList(marked, graceSocket.frames.size());
        assertThat(countStatus(offline, ada.id, "OFFLINE")).isEqualTo(1);
        assertThat(countStatus(offline, ada.id, "ONLINE")).isZero();
        int beforeReconnect = graceSocket.frames.size();
        open(ada.token);
        assertThat(awaitStatus(graceSocket, ada.id, "ONLINE", 5)).isTrue();
        drain(graceSocket);
        assertThat(countStatus(graceSocket.frames.subList(beforeReconnect, graceSocket.frames.size()), ada.id, "OFFLINE")).isZero();
        assertThat(countStatus(graceSocket.frames.subList(beforeReconnect, graceSocket.frames.size()), ada.id, "ONLINE")).isEqualTo(1);
    }

    @Test
    void presenceFollowsFriendshipPrivacyAndActivity() throws Exception {
        Account ada = account("ada");
        Account grace = account("grace");
        Account cy = account("cyra");
        befriend(ada, grace);
        open(ada.token);
        assertThat(presenceStatus(grace.token, ada.id)).isEqualTo("ONLINE");
        JsonNode stranger = presenceNode(cy.token, ada.id);
        assertThat(stranger.path("status").asText()).isEqualTo("ONLINE");
        assertThat(stranger.path("lastSeenAt").isMissingNode() || stranger.path("lastSeenAt").isNull()).isTrue();

        updateProfile(ada.token, "{\"accountType\":\"PRIVATE\"}");
        assertThat(presenceHidden(cy.token, ada.id)).isTrue();
        assertThat(presenceStatus(grace.token, ada.id)).isEqualTo("ONLINE");

        updateProfile(ada.token, "{\"showActivityStatus\":false}");
        assertThat(presenceHidden(grace.token, ada.id)).isTrue();
        assertThat(presenceHidden(cy.token, ada.id)).isTrue();
    }

    @Test
    void blockStopsPresenceTypingAndMessagesInBothDirections() throws Exception {
        Account ada = account("ada");
        Account grace = account("grace");
        befriend(ada, grace);
        String conversationId = conversation(ada, grace.id);
        Socket graceSocket = open(grace.token);
        Socket adaSocket = open(ada.token);
        assertThat(awaitStatus(graceSocket, ada.id, "ONLINE", 5)).isTrue();
        mockMvc.perform(post("/api/v1/users/" + grace.id + "/block").header(HttpHeaders.AUTHORIZATION, "Bearer " + ada.token))
                .andExpect(status().isOk());
        drain(graceSocket);
        int seen = graceSocket.frames.size();
        adaSocket.session.sendMessage(new TextMessage("{\"type\":\"TYPING_START\",\"conversationId\":\"" + conversationId + "\"}"));
        sleep(1_000);
        drain(graceSocket);
        assertThat(graceSocket.frames.subList(seen, graceSocket.frames.size()).stream().filter(frame -> frame.contains("TYPING_START")).count()).isZero();
        mockMvc.perform(post("/api/v1/conversations/" + conversationId + "/messages")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + ada.token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(messageBody("blocked1")))
                .andExpect(status().isForbidden());
        assertThat(mockMvc.perform(get("/api/v1/users/" + ada.id).header(HttpHeaders.AUTHORIZATION, "Bearer " + grace.token))
                .andReturn().getResponse().getStatus()).isEqualTo(404);

        Account ada2 = account("ada2");
        Account grace2 = account("grace2");
        befriend(ada2, grace2);
        String otherConversation = conversation(ada2, grace2.id);
        Socket ada2Socket = open(ada2.token);
        mockMvc.perform(post("/api/v1/users/" + ada2.id + "/block").header(HttpHeaders.AUTHORIZATION, "Bearer " + grace2.token))
                .andExpect(status().isOk());
        ada2Socket.session.sendMessage(new TextMessage("{\"type\":\"TYPING_START\",\"conversationId\":\"" + otherConversation + "\"}"));
        sleep(1_000);
        mockMvc.perform(post("/api/v1/conversations/" + otherConversation + "/messages")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + ada2.token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(messageBody("blocked2")))
                .andExpect(status().isForbidden());
        assertThat(mockMvc.perform(get("/api/v1/users/" + grace2.id).header(HttpHeaders.AUTHORIZATION, "Bearer " + ada2.token))
                .andReturn().getResponse().getStatus()).isEqualTo(404);
    }

    @Test
    void typingIsTransientAndMessagesFollowRecipientRules() throws Exception {
        Account ada = account("ada");
        Account grace = account("grace");
        Account cy = account("cyra");
        befriend(ada, grace);
        String conversationId = conversation(ada, grace.id);
        long messagesBefore = mongoTemplate.count(new Query(), "messages");
        long notificationsBefore = mongoTemplate.count(new Query(), "notifications");
        Socket graceSocket = open(grace.token);
        Socket adaSocket = open(ada.token);
        adaSocket.session.sendMessage(new TextMessage("{\"type\":\"TYPING_START\",\"conversationId\":\"" + conversationId + "\"}"));
        assertThat(awaitType(graceSocket, "TYPING_START", 5)).isTrue();
        adaSocket.session.sendMessage(new TextMessage("{\"type\":\"TYPING_STOP\",\"conversationId\":\"" + conversationId + "\"}"));
        assertThat(awaitType(graceSocket, "TYPING_STOP", 5)).isTrue();
        assertThat(mongoTemplate.count(new Query(), "messages")).isEqualTo(messagesBefore);
        assertThat(mongoTemplate.count(new Query(), "notifications")).isEqualTo(notificationsBefore);
        String typingFrame = graceSocket.frames.stream().filter(frame -> frame.contains("TYPING_START")).findFirst().orElseThrow();
        assertThat(typingFrame).doesNotContain("ciphertext");
        assertThat(typingFrame).doesNotContain("Sup3rSecret");

        adaSocket.session.close();
        graceSocket.session.close();
        MvcResult sent = mockMvc.perform(post("/api/v1/conversations/" + conversationId + "/messages")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + ada.token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(messageBody("opaque-live")))
                .andExpect(status().isCreated())
                .andReturn();
        JsonNode storedSent = objectMapper.readTree(sent.getResponse().getContentAsString()).path("data");
        assertThat(storedSent.path("status").asText()).isEqualTo("SENT");
        assertThat(storedSent.path("ciphertext").asText()).doesNotContain("opaque-live");
        String messageId = storedSent.path("id").asText();

        Socket adaAgain = open(ada.token);
        Socket graceAgain = open(grace.token);
        assertThat(awaitType(graceAgain, "MESSAGE", 5)).isTrue();
        assertThat(awaitType(adaAgain, "DELIVERED", 5)).isTrue();
        assertThat(messageStatus(ada.token, conversationId, messageId)).isEqualTo("DELIVERED");

        open(cy.token).session.sendMessage(new TextMessage("{\"type\":\"READ\",\"messageId\":\"" + messageId + "\"}"));
        sleep(1_000);
        assertThat(messageStatus(ada.token, conversationId, messageId)).isEqualTo("DELIVERED");

        graceAgain.session.sendMessage(new TextMessage("{\"type\":\"READ\",\"messageId\":\"" + messageId + "\"}"));
        assertThat(awaitType(adaAgain, "READ", 5)).isTrue();
        assertThat(messageStatus(ada.token, conversationId, messageId)).isEqualTo("READ");
        assertThat(mongoTemplate.count(new org.springframework.data.mongodb.core.query.Query(
                org.springframework.data.mongodb.core.query.Criteria.where("_id").is(messageId)), "messages")).isEqualTo(1);
    }

    private Account account(String username) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"username":"%s","email":"%s@example.com","password":"Sup3rSecret","displayName":"%s"}
                                """.formatted(username, username, username)))
                .andExpect(status().isCreated())
                .andReturn();
        JsonNode data = objectMapper.readTree(result.getResponse().getContentAsString()).path("data");
        String token = data.path("accessToken").asText();
        return new Account(data.path("user").path("id").asText(), token);
    }

    private void befriend(Account first, Account second) throws Exception {
        String requestId = id(postJson(first.token, "/api/v1/friend-requests/" + second.id, null));
        postJson(second.token, "/api/v1/friend-requests/" + requestId + "/accept", null);
    }

    private String conversation(Account owner, String participantId) throws Exception {
        return id(postJson(owner.token, "/api/v1/conversations", "{\"participantId\":\"" + participantId + "\"}"));
    }

    private Socket open(String token) throws Exception {
        QueueHandler handler = new QueueHandler();
        WebSocketHttpHeaders headers = new WebSocketHttpHeaders();
        headers.setBearerAuth(token);
        WebSocketSession session = client.execute(handler, headers, URI.create("ws://127.0.0.1:" + port + "/ws/chat"))
                .get(5, TimeUnit.SECONDS);
        sessions.add(session);
        Socket socket = new Socket(session, handler);
        assertThat(awaitType(socket, "READY", 5)).isTrue();
        return socket;
    }

    private void updateProfile(String token, String body) throws Exception {
        mockMvc.perform(patch("/api/v1/users/me")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk());
    }

    private boolean presenceHidden(String token, String userId) throws Exception {
        JsonNode presence = presenceNode(token, userId);
        return presence.isNull() || presence.isMissingNode();
    }

    private String presenceStatus(String token, String userId) throws Exception {
        JsonNode presence = presenceNode(token, userId);
        return presence.isNull() ? null : presence.path("status").asText();
    }

    private JsonNode presenceNode(String token, String userId) throws Exception {
        MvcResult result = mockMvc.perform(get("/api/v1/users/" + userId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).path("data").path("presence");
    }

    private String messageStatus(String token, String conversationId, String messageId) throws Exception {
        MvcResult result = mockMvc.perform(get("/api/v1/conversations/" + conversationId + "/messages")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        for (JsonNode item : objectMapper.readTree(result.getResponse().getContentAsString()).path("data").path("items")) {
            if (messageId.equals(item.path("id").asText())) {
                return item.path("status").asText();
            }
        }
        return null;
    }

    private String lastSeen(String userId) {
        Document user = mongoTemplate.findById(userId, Document.class, "users");
        Object value = user == null ? null : user.get("lastSeenAt");
        return value == null ? null : value.toString();
    }

    private String postJson(String token, String path, String body) throws Exception {
        var request = post(path).header(HttpHeaders.AUTHORIZATION, "Bearer " + token);
        if (body != null) {
            request.contentType(MediaType.APPLICATION_JSON).content(body);
        }
        return mockMvc.perform(request).andExpect(status().is2xxSuccessful()).andReturn().getResponse().getContentAsString();
    }

    private String id(String json) throws Exception {
        return objectMapper.readTree(json).path("data").path("id").asText();
    }

    private static String messageBody(String plaintextLabel) {
        return """
                {"ciphertext":"%s","messageType":"TEXT","clientMessageId":"%s"}
                """.formatted(Base64.getEncoder().encodeToString(plaintextLabel.getBytes()), plaintextLabel);
    }

    private boolean awaitStatus(Socket socket, String userId, String status, int seconds) throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(seconds);
        while (System.nanoTime() < deadline) {
            String frame = socket.handler.messages.poll(200, TimeUnit.MILLISECONDS);
            if (frame == null) {
                continue;
            }
            socket.frames.add(frame);
            if (frame.contains("PRESENCE_UPDATE") && frame.contains(userId) && frame.contains("\"" + status + "\"")) {
                return true;
            }
        }
        return false;
    }

    private boolean awaitType(Socket socket, String type, int seconds) throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(seconds);
        while (System.nanoTime() < deadline) {
            String frame = socket.handler.messages.poll(200, TimeUnit.MILLISECONDS);
            if (frame == null) {
                continue;
            }
            socket.frames.add(frame);
            if (frame.contains("\"" + type + "\"")) {
                return true;
            }
        }
        return false;
    }

    private List<String> drain(Socket socket) throws InterruptedException {
        String frame;
        while ((frame = socket.handler.messages.poll(400, TimeUnit.MILLISECONDS)) != null) {
            socket.frames.add(frame);
        }
        return frames(socket);
    }

    private static List<String> frames(Socket socket) {
        return socket.frames;
    }

    private static long countStatus(List<String> frames, String userId, String status) {
        return frames.stream()
                .filter(frame -> frame.contains("PRESENCE_UPDATE") && frame.contains(userId) && frame.contains("\"" + status + "\""))
                .count();
    }

    private static void sleep(long millis) throws InterruptedException {
        Thread.sleep(millis);
    }

    private record Account(String id, String token) {
    }

    private static final class Socket {
        private final WebSocketSession session;
        private final QueueHandler handler;
        private final List<String> frames = new ArrayList<>();

        private Socket(WebSocketSession session, QueueHandler handler) {
            this.session = session;
            this.handler = handler;
        }
    }

    private static final class QueueHandler extends TextWebSocketHandler {
        private final BlockingQueue<String> messages = new ArrayBlockingQueue<>(500);

        @Override
        protected void handleTextMessage(WebSocketSession session, TextMessage message) {
            messages.offer(message.getPayload());
        }
    }
}
