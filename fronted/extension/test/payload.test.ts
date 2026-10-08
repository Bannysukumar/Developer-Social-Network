import { describe, expect, test } from "bun:test";
import { decodeOpaqueText, encodeOpaqueText } from "../src/shared/payload";

describe("opaque payload helpers", () => {
  test("round-trips UTF-8 text through Base64 transport encoding", () => {
    const text = "hello DevConnect 👋";
    const encoded = encodeOpaqueText(text);
    expect(encoded).not.toBe(text);
    expect(decodeOpaqueText(encoded)).toBe(text);
  });

  test("does not pretend random ciphertext is readable text", () => {
    expect(decodeOpaqueText("@@@not-base64@@@")).toBe("[opaque payload]");
  });
});
