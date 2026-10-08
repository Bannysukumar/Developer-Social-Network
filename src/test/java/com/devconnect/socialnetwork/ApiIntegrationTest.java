package com.devconnect.socialnetwork;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.devconnect.socialnetwork.entity.MessageEntity;
import com.devconnect.socialnetwork.repository.MessageRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.Base64;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class ApiIntegrationTest extends AbstractIntegrationTest {

    private static final String PASSWORD = "Sup3rSecret";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private MessageRepository messageRepository;

    @BeforeEach
    void setUp() {
        cleanDatabase();
    }

    @Test
    void authenticationValidationAndSessionRevocation() throws Exception {
        mockMvc.perform(post("/api/v1/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(userJson("ada", "ada@example.com", "weak", "Ada")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("VALIDATION_ERROR"));

        Session ada = signup("ada", "ada@example.com", "Ada Lovelace");
        mockMvc.perform(post("/api/v1/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(userJson("ada", "other@example.com", PASSWORD, "Other")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Username or email is already in use"));

        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"usernameOrEmail":"ada","password":"WrongPass1"}
                                """))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Invalid username or password"));

        mockMvc.perform(get("/api/v1/users/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("AUTHENTICATION_ERROR"));

        mockMvc.perform(get("/api/v1/users/me").header("Authorization", "Bearer not-a-jwt"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("INVALID_TOKEN"));

        mockMvc.perform(post("/api/v1/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"username":"bob","email":"bob@example.com","password":"%s","displayName":"Bob","roles":["ADMIN"]}
                                """.formatted(PASSWORD)))
                .andExpect(status().isBadRequest());

        mockMvc.perform(get("/api/v1/users/me").header("Authorization", "Bearer " + ada.accessToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.email").value("ada@example.com"))
                .andExpect(jsonPath("$.data.passwordHash").doesNotExist())
                .andExpect(jsonPath("$.data.roles[0]").value("USER"));

        MvcResult refreshed = mockMvc.perform(post("/api/v1/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"refreshToken":"%s"}
                                """.formatted(ada.refreshToken())))
                .andExpect(status().isOk())
                .andReturn();
        String rotated = objectMapper.readTree(refreshed.getResponse().getContentAsString()).path("data").path("refreshToken").asText();
        String rotatedAccess = objectMapper.readTree(refreshed.getResponse().getContentAsString()).path("data").path("accessToken").asText();
        assertThat(rotated).isNotEqualTo(ada.refreshToken());

        mockMvc.perform(post("/api/v1/auth/logout")
                        .header("Authorization", "Bearer " + rotatedAccess)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"refreshToken":"%s"}
                                """.formatted(rotated)))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/users/me").header("Authorization", "Bearer " + rotatedAccess))
                .andExpect(status().isUnauthorized());

        Session reuse = login("ada");
        MvcResult rotatedAgain = mockMvc.perform(post("/api/v1/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"refreshToken":"%s"}
                                """.formatted(reuse.refreshToken())))
                .andExpect(status().isOk())
                .andReturn();
        String replacement = objectMapper.readTree(rotatedAgain.getResponse().getContentAsString()).path("data").path("accessToken").asText();
        mockMvc.perform(post("/api/v1/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"refreshToken":"%s"}
                                """.formatted(reuse.refreshToken())))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/v1/users/me").header("Authorization", "Bearer " + replacement))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void profilesSearchPrivacyFriendsAndBlocks() throws Exception {
        Session ada = signup("ada", "ada@example.com", "Ada Lovelace");
        Session grace = signup("grace", "grace@example.com", "Grace Hopper");

        mockMvc.perform(patch("/api/v1/users/me")
                        .header("Authorization", "Bearer " + grace.accessToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"bio":"Computers","accountType":"PRIVATE","passwordHash":"nope"}
                                """))
                .andExpect(status().isBadRequest());

        mockMvc.perform(patch("/api/v1/users/me")
                        .header("Authorization", "Bearer " + grace.accessToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"bio":"Computers","accountType":"PRIVATE"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.accountType").value("PRIVATE"));

        mockMvc.perform(get("/api/v1/users/" + grace.userId()).header("Authorization", "Bearer " + ada.accessToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.limited").value(true))
                .andExpect(jsonPath("$.data.bio").doesNotExist())
                .andExpect(jsonPath("$.data.email").doesNotExist());

        mockMvc.perform(get("/api/v1/users/search")
                        .header("Authorization", "Bearer " + ada.accessToken())
                        .param("q", "grace"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].username").value("grace"));

        mockMvc.perform(get("/api/v1/users/search")
                        .header("Authorization", "Bearer " + ada.accessToken())
                        .param("q", "$where"))
                .andExpect(status().isBadRequest());

        mockMvc.perform(get("/api/v1/users/search")
                        .header("Authorization", "Bearer " + ada.accessToken())
                        .param("q", "gr")
                        .param("size", "1000000"))
                .andExpect(status().isBadRequest());

        mockMvc.perform(post("/api/v1/friend-requests/" + ada.userId())
                        .header("Authorization", "Bearer " + ada.accessToken()))
                .andExpect(status().isConflict());

        MvcResult request = mockMvc.perform(post("/api/v1/friend-requests/" + grace.userId())
                        .header("Authorization", "Bearer " + ada.accessToken()))
                .andExpect(status().isCreated())
                .andReturn();
        String requestId = objectMapper.readTree(request.getResponse().getContentAsString()).path("data").path("id").asText();

        mockMvc.perform(post("/api/v1/friend-requests/" + grace.userId())
                        .header("Authorization", "Bearer " + ada.accessToken()))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/v1/friend-requests/" + requestId + "/accept")
                        .header("Authorization", "Bearer " + ada.accessToken()))
                .andExpect(status().isForbidden());

        mockMvc.perform(post("/api/v1/friend-requests/" + requestId + "/accept")
                        .header("Authorization", "Bearer " + grace.accessToken()))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/users/" + grace.userId()).header("Authorization", "Bearer " + ada.accessToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.limited").value(false))
                .andExpect(jsonPath("$.data.bio").value("Computers"));

        mockMvc.perform(get("/api/v1/friends").header("Authorization", "Bearer " + ada.accessToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1));

        mockMvc.perform(post("/api/v1/users/" + grace.userId() + "/block")
                        .header("Authorization", "Bearer " + ada.accessToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.blockedByMe").value(true));

        mockMvc.perform(get("/api/v1/users/" + ada.userId()).header("Authorization", "Bearer " + grace.accessToken()))
                .andExpect(status().isNotFound());

        mockMvc.perform(post("/api/v1/friend-requests/" + ada.userId())
                        .header("Authorization", "Bearer " + grace.accessToken()))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/v1/users/search")
                        .header("Authorization", "Bearer " + grace.accessToken())
                        .param("q", "ada"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items").isEmpty());

        mockMvc.perform(delete("/api/v1/users/" + grace.userId() + "/block")
                        .header("Authorization", "Bearer " + grace.accessToken()))
                .andExpect(status().isNotFound());

        mockMvc.perform(delete("/api/v1/users/" + grace.userId() + "/block")
                        .header("Authorization", "Bearer " + ada.accessToken()))
                .andExpect(status().isOk());
    }

    @Test
    void messagesStayCiphertextAndRejectUnauthorizedAccess() throws Exception {
        Session ada = signup("ada", "ada@example.com", "Ada Lovelace");
        Session grace = signup("grace", "grace@example.com", "Grace Hopper");
        becomeFriends(ada, grace);

        MvcResult created = mockMvc.perform(post("/api/v1/conversations")
                        .header("Authorization", "Bearer " + ada.accessToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"participantId":"%s"}
                                """.formatted(grace.userId())))
                .andExpect(status().isCreated())
                .andReturn();
        String conversationId = objectMapper.readTree(created.getResponse().getContentAsString()).path("data").path("id").asText();

        Session outsider = signup("alan", "alan@example.com", "Alan Turing");
        mockMvc.perform(get("/api/v1/conversations/" + conversationId)
                        .header("Authorization", "Bearer " + outsider.accessToken()))
                .andExpect(status().isNotFound());

        String ciphertext = Base64.getEncoder().encodeToString("opaque-payload".getBytes());
        mockMvc.perform(post("/api/v1/conversations/" + conversationId + "/messages")
                        .header("Authorization", "Bearer " + ada.accessToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"ciphertext":"%s","messageType":"TEXT","plaintext":"hello","clientMessageId":"client-msg-1"}
                                """.formatted(ciphertext)))
                .andExpect(status().isBadRequest());

        MvcResult sent = mockMvc.perform(post("/api/v1/conversations/" + conversationId + "/messages")
                        .header("Authorization", "Bearer " + ada.accessToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"ciphertext":"%s","messageType":"TEXT","clientMessageId":"client-msg-1"}
                                """.formatted(ciphertext)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.ciphertext").value(ciphertext))
                .andReturn();
        String messageId = objectMapper.readTree(sent.getResponse().getContentAsString()).path("data").path("id").asText();

        mockMvc.perform(post("/api/v1/conversations/" + conversationId + "/messages")
                        .header("Authorization", "Bearer " + ada.accessToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"ciphertext":"%s","messageType":"TEXT","clientMessageId":"client-msg-1"}
                                """.formatted(ciphertext)))
                .andExpect(status().isOk());

        MessageEntity stored = messageRepository.findById(messageId).orElseThrow();
        assertThat(stored.getCiphertext()).isEqualTo(ciphertext);
        assertThat(stored.getCiphertext()).doesNotContain("opaque-payload");

        mockMvc.perform(get("/api/v1/conversations/" + conversationId + "/messages")
                        .header("Authorization", "Bearer " + outsider.accessToken()))
                .andExpect(status().isNotFound());

        mockMvc.perform(patch("/api/v1/messages/" + messageId + "/read")
                        .header("Authorization", "Bearer " + ada.accessToken()))
                .andExpect(status().isForbidden());

        mockMvc.perform(patch("/api/v1/messages/" + messageId + "/read")
                        .header("Authorization", "Bearer " + grace.accessToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("READ"));

        mockMvc.perform(get("/api/v1/notifications").header("Authorization", "Bearer " + grace.accessToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.page.items[0].message").value("You received a new encrypted message"));

        mockMvc.perform(post("/api/v1/users/" + grace.userId() + "/block")
                        .header("Authorization", "Bearer " + ada.accessToken()))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/v1/conversations/" + conversationId + "/messages")
                        .header("Authorization", "Bearer " + grace.accessToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"ciphertext":"%s","messageType":"TEXT","clientMessageId":"client-msg-2"}
                                """.formatted(ciphertext)))
                .andExpect(status().isForbidden());
    }

    @Test
    void passwordResetDoesNotRevealAccountsAndOversizedBodiesAreRejected() throws Exception {
        signup("ada", "ada@example.com", "Ada Lovelace");
        mockMvc.perform(post("/api/v1/auth/forgot-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"missing@example.com"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("If an account exists for that email, password reset instructions have been sent"));

        mockMvc.perform(post("/api/v1/auth/forgot-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"ada@example.com"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("If an account exists for that email, password reset instructions have been sent"));

        byte[] huge = new byte[1_100_000];
        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(huge))
                .andExpect(status().isPayloadTooLarge());
    }

    @Test
    void keyDirectoryStoresOnlyPublicMaterial() throws Exception {
        Session ada = signup("ada", "ada@example.com", "Ada Lovelace");
        Session grace = signup("grace", "grace@example.com", "Grace Hopper");
        var identity = com.devconnect.socialnetwork.crypto.Ed25519Signatures.generateIdentity();
        String publicKey = identity.publicKey();
        String preKey = com.devconnect.socialnetwork.crypto.Ed25519Signatures.randomPublicKey();
        String oneTime = com.devconnect.socialnetwork.crypto.Ed25519Signatures.randomPublicKey();
        String signature = com.devconnect.socialnetwork.crypto.Ed25519Signatures.sign(identity.privateKey(), preKey);

        MvcResult identityResult = mockMvc.perform(post("/api/v1/keys/identity")
                        .header("Authorization", "Bearer " + ada.accessToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"deviceName":"VS Code","platform":"EXTENSION","algorithm":"Ed25519","publicKey":"%s"}
                                """.formatted(publicKey)))
                .andExpect(status().isOk())
                .andReturn();
        String deviceId = objectMapper.readTree(identityResult.getResponse().getContentAsString()).path("data").path("id").asText();

        mockMvc.perform(post("/api/v1/keys/prekeys")
                        .header("Authorization", "Bearer " + ada.accessToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"deviceId":"%s","signedPreKey":{"preKeyId":1,"publicKey":"%s","signature":"%s"},"oneTimePreKeys":[{"preKeyId":2,"publicKey":"%s"}]}
                                """.formatted(deviceId, preKey, signature, oneTime)))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/keys/" + ada.userId()).header("Authorization", "Bearer " + grace.accessToken()))
                .andExpect(status().isForbidden());

        becomeFriends(ada, grace);
        mockMvc.perform(get("/api/v1/keys/" + ada.userId()).header("Authorization", "Bearer " + grace.accessToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.devices[0].identityPublicKey").value(publicKey))
                .andExpect(jsonPath("$.data.devices[0].oneTimePreKey.preKeyId").value(2));

        mockMvc.perform(delete("/api/v1/devices/" + deviceId).header("Authorization", "Bearer " + grace.accessToken()))
                .andExpect(status().isNotFound());
        mockMvc.perform(delete("/api/v1/devices/" + deviceId).header("Authorization", "Bearer " + ada.accessToken()))
                .andExpect(status().isOk());
    }

    private void becomeFriends(Session first, Session second) throws Exception {
        MvcResult request = mockMvc.perform(post("/api/v1/friend-requests/" + second.userId())
                        .header("Authorization", "Bearer " + first.accessToken()))
                .andExpect(status().isCreated())
                .andReturn();
        String requestId = objectMapper.readTree(request.getResponse().getContentAsString()).path("data").path("id").asText();
        mockMvc.perform(post("/api/v1/friend-requests/" + requestId + "/accept")
                        .header("Authorization", "Bearer " + second.accessToken()))
                .andExpect(status().isOk());
    }

    private Session login(String username) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"usernameOrEmail":"%s","password":"%s"}
                                """.formatted(username, PASSWORD)))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode data = objectMapper.readTree(result.getResponse().getContentAsString()).path("data");
        return new Session(
                data.path("user").path("id").asText(),
                data.path("accessToken").asText(),
                data.path("refreshToken").asText()
        );
    }

    private Session signup(String username, String email, String displayName) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(userJson(username, email, PASSWORD, displayName)))
                .andExpect(status().isCreated())
                .andReturn();
        JsonNode data = objectMapper.readTree(result.getResponse().getContentAsString()).path("data");
        return new Session(
                data.path("user").path("id").asText(),
                data.path("accessToken").asText(),
                data.path("refreshToken").asText()
        );
    }

    private String userJson(String username, String email, String password, String displayName) throws Exception {
        return objectMapper.writeValueAsString(Map.of(
                "username", username,
                "email", email,
                "password", password,
                "displayName", displayName
        ));
    }

    private record Session(String userId, String accessToken, String refreshToken) {
    }
}
