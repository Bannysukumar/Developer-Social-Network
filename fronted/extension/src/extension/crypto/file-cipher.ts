import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface SealedFile {
  readonly ciphertext: Buffer;
  readonly key: string;
  readonly iv: string;
}

/** Encrypts file bytes with a fresh AES-256-GCM key. The server stores only the ciphertext. */
export function sealFile(plaintext: Buffer): SealedFile {
  const key = randomBytes(KEY_BYTES);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    ciphertext: Buffer.concat([body, cipher.getAuthTag()]),
    key: key.toString("base64"),
    iv: iv.toString("base64"),
  };
}

export function openFile(ciphertext: Buffer, key: string, iv: string): Buffer {
  if (ciphertext.length <= TAG_BYTES) {
    throw new Error("This file could not be opened.");
  }
  const body = ciphertext.subarray(0, ciphertext.length - TAG_BYTES);
  const tag = ciphertext.subarray(ciphertext.length - TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(key, "base64"), Buffer.from(iv, "base64"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}
