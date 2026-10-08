import { describe, expect, test } from "bun:test";
import { chatSocketUrl, messageFromFrame, parseServerFrame } from "../src/extension/chat-socket";

describe("chat socket contract", () => {
  test("uses WSS for HTTPS and WS only for an already allowed HTTP base", () => {
    expect(chatSocketUrl("https://example.test/api/v1")).toBe("wss://example.test/ws/chat");
    expect(chatSocketUrl("http://185.216.203.209/api/v1")).toBe("ws://185.216.203.209/ws/chat");
  });

  test("parses server frames and ignores malformed payloads", () => {
    expect(parseServerFrame('{"type":"PONG","data":{}}')?.type).toBe("PONG");
    expect(parseServerFrame("not-json")).toBeUndefined();
    expect(parseServerFrame('{"type":"NOPE"}')).toBeUndefined();
  });

  test("reads a MESSAGE frame without requiring the token", () => {
    const message = messageFromFrame({
      type: "MESSAGE",
      data: {
        id: "m1",
        conversationId: "c1",
        senderId: "u2",
        recipientId: "u1",
        ciphertext: Buffer.from("hi").toString("base64"),
        messageType: "TEXT",
        status: "SENT",
      },
    });
    expect(message?.id).toBe("m1");
    expect(messageFromFrame({ type: "PONG" })).toBeUndefined();
  });
});
