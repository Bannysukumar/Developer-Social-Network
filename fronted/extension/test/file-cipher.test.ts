import { describe, expect, test } from "bun:test";
import { openFile, sealFile } from "../src/extension/crypto/file-cipher";
import { encodeFilePayload, isRiskyFile, parseFilePayload } from "../src/extension/crypto/file-payload";

describe("attachment encryption", () => {
  test("round-trips a file and rejects a changed byte", () => {
    const sealed = sealFile(Buffer.from("hello zip"));
    expect(openFile(sealed.ciphertext, sealed.key, sealed.iv).toString("utf8")).toBe("hello zip");
    const tampered = Buffer.from(sealed.ciphertext);
    tampered[0] ^= 1;
    expect(() => openFile(tampered, sealed.key, sealed.iv)).toThrow("This file could not be opened.");
  });

  test("opens JPEG, PNG, GIF, and WebP bytes and rejects the wrong key", () => {
    const samples = [
      { mime: "image/jpeg", bytes: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) },
      { mime: "image/png", bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
      { mime: "image/gif", bytes: Buffer.from("GIF89a") },
      { mime: "image/webp", bytes: Buffer.from("RIFF\0\0\0\0WEBP") },
    ];
    for (const sample of samples) {
      const sealed = sealFile(sample.bytes);
      expect(openFile(sealed.ciphertext, sealed.key, sealed.iv).equals(sample.bytes)).toBe(true);
      expect(sealed.ciphertext.includes(sample.bytes)).toBe(false);
      const payload = encodeFilePayload("", [{
        id: "file-1",
        name: `photo.${sample.mime.split("/")[1]}`,
        size: sample.bytes.length,
        mime: sample.mime,
        key: sealed.key,
        iv: sealed.iv,
        preview: "data:image/png;base64,AAAA",
      }]);
      expect(payload).not.toContain("preview");
      expect(payload).toContain(sealed.key);
      expect(() => openFile(sealed.ciphertext, Buffer.from("wrong-key-material-32b").toString("base64"), sealed.iv))
        .toThrow("This file could not be opened.");
    }
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