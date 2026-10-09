import { describe, expect, test } from "bun:test";
import { openFile, sealFile } from "../src/extension/crypto/file-cipher";
import { encodeFilePayload, isRiskyFile, parseFilePayload } from "../src/extension/crypto/file-payload";

describe("attachment encryption", () => {
  test("round-trips a file and rejects a changed byte", () => {
    const sealed = sealFile(Buffer.from("hello zip"));
    expect(openFile(sealed.ciphertext, sealed.key, sealed.iv).toString("utf8")).toBe("hello zip");
    const tampered = Buffer.from(sealed.ciphertext);
    tampered[0] ^= 1;
    expect(() => openFile(tampered, sealed.key, sealed.iv)).toThrow();
  });

  test("keeps the caption and file key inside the message payload", () => {
    const payload = encodeFilePayload("see this", [{
      id: "507f1f77bcf86cd799439011",
      name: "notes.pdf",
      size: 12,
      mime: "application/pdf",
      key: "a2V5",
      iv: "aXY",
    }]);
    const parsed = parseFilePayload(payload);
    expect(parsed?.text).toBe("see this");
    expect(parsed?.files[0]?.name).toBe("notes.pdf");
    expect(parseFilePayload("plain text")).toBeUndefined();
    expect(isRiskyFile("setup.exe")).toBe(true);
    expect(isRiskyFile("photo.png")).toBe(false);
  });
});