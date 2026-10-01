package com.trivexa.socialnetwork;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpHeaders;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.net.URI;
import java.util.Base64;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
class WebSocketIntegrationTest extends AbstractIntegrationTest {

    @LocalServerPort
    private int port;

    @Autowired
    private org.springframework.test.web.servlet.MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        cleanDatabase();
    }

    @Test
    void rejectsAnonymousClientsAndDeliversCiphertextToMembers() throws Exception {
        StandardWebSocketClient client = new StandardWebSocketClient();
        assertThatThrownBy(() -> client.execute(new TextWebSocketHandler() {
                }, null, URI.create("ws://127.0.0.1:" + port + "/ws/chat"))
                .get(5, TimeUnit.SECONDS)).isInstanceOf(Exception.class);

        String adaToken = signup("ada", "ada@example.com");
        String graceToken = signup("grace", "grace@example.com");
        String adaId = userId(adaToken);
        String graceId = userId(graceToken);
        String requestId = id(postJson(adaToken, "/api/v1/friend-requests/" + graceId, null));
        postJson(graceToken, "/api/v1/friend-requests/" + requestId + "/accept", null);
        String conversationId = id(postJson(adaToken, "/api/v1/conversations",
                "{\"participantId\":\"" + graceId + "\"}"));

        QueueHandler graceHandler = new QueueHandler();
        WebSocketHttpHeaders headers = new WebSocketHttpHeaders();
        headers.setBearerAuth(graceToken);
        WebSocketSession graceSession = client.execute(graceHandler, headers, URI.create("ws://127.0.0.1:" + port + "/ws/chat"))
                .get(5, TimeUnit.SECONDS);
        assertThat(graceHandler.messages.poll(5, TimeUnit.SECONDS)).contains("READY");

        QueueHandler adaHandler = new QueueHandler();
        WebSocketHttpHeaders adaHeaders = new WebSocketHttpHeaders();
        adaHeaders.setBearerAuth(adaToken);
        WebSocketSession adaSession = client.execute(adaHandler, adaHeaders, URI.create("ws://127.0.0.1:" + port + "/ws/chat"))
                .get(5, TimeUnit.SECONDS);
        adaHandler.messages.poll(5, TimeUnit.SECONDS);

        String ciphertext = Base64.getEncoder().encodeToString("opaque-payload".getBytes());
        adaSession.sendMessage(new TextMessage("""
                {"type":"SEND","conversationId":"%s","ciphertext":"%s","messageType":"TEXT","clientMessageId":"ws-message-1"}
                """.formatted(conversationId, ciphertext)));

        String delivered = graceHandler.messages.poll(5, TimeUnit.SECONDS);
        assertThat(delivered).contains(ciphertext);
        assertThat(delivered).doesNotContain("opaque-payload");

        adaSession.sendMessage(new TextMessage("{\"type\":\"SEND\"}"));
        StringBuilder adaFrames = new StringBuilder();
        for (int i = 0; i < 5; i++) {
            String next = adaHandler.messages.poll(2, TimeUnit.SECONDS);
            if (next == null) {
                break;
            }
            adaFrames.append(next);
        }
        assertThat(adaFrames.toString()).contains("ERROR");

        graceSession.close();
        adaSession.close();
    }

    private String signup(String username, String email) throws Exception {
        var result = mockMvc.perform(post("/api/v1/auth/signup")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("""
                                {"username":"%s","email":"%s","password":"Sup3rSecret","displayName":"%s"}
                                """.formatted(username, email, username)))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).path("data").path("accessToken").asText();
    }

    private String userId(String token) throws Exception {
        var result = mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/users/me")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).path("data").path("id").asText();
    }

    private String postJson(String token, String path, String body) throws Exception {
        var request = post(path).header(HttpHeaders.AUTHORIZATION, "Bearer " + token);
        if (body != null) {
            request.contentType(org.springframework.http.MediaType.APPLICATION_JSON).content(body);
        }
        var result = mockMvc.perform(request).andExpect(status().is2xxSuccessful()).andReturn();
        return result.getResponse().getContentAsString();
    }

    private String id(String json) throws Exception {
        JsonNode node = objectMapper.readTree(json).path("data").path("id");
        return node.asText();
    }

    private static final class QueueHandler extends TextWebSocketHandler {
        private final BlockingQueue<String> messages = new ArrayBlockingQueue<>(20);

        @Override
        protected void handleTextMessage(WebSocketSession session, TextMessage message) {
            messages.offer(message.getPayload());
        }
    }
}
