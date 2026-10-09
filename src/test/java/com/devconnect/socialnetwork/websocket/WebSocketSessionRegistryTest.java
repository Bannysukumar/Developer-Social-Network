package com.devconnect.socialnetwork.websocket;

import org.junit.jupiter.api.Test;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class WebSocketSessionRegistryTest {

    @Test
    void aSlowSocketDoesNotDelayDeliveryToAnotherSocket() throws Exception {
        WebSocketSessionRegistry registry = new WebSocketSessionRegistry();
        WebSocketSession slow = mock(WebSocketSession.class);
        WebSocketSession fast = mock(WebSocketSession.class);
        when(slow.isOpen()).thenReturn(true);
        when(slow.getId()).thenReturn("slow");
        when(fast.isOpen()).thenReturn(true);
        when(fast.getId()).thenReturn("fast");
        doAnswer(invocation -> {
            Thread.sleep(2_000);
            return null;
        }).when(slow).sendMessage(any(TextMessage.class));
        CountDownLatch delivered = new CountDownLatch(1);
        doAnswer(invocation -> {
            delivered.countDown();
            return null;
        }).when(fast).sendMessage(any(TextMessage.class));
        registry.add("ada", slow);
        registry.add("ada", fast);

        long started = System.nanoTime();
        registry.send("ada", "{\"type\":\"READ\"}");
        try {
            assertThat(delivered.await(500, TimeUnit.MILLISECONDS)).isTrue();
            long elapsedMs = (System.nanoTime() - started) / 1_000_000L;
            assertThat(elapsedMs).isLessThan(500);
        } finally {
            registry.close();
        }
    }
}
