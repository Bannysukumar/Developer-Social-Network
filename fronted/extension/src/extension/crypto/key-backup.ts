import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

export interface KeyBackupBlob {
  readonly version: 1;
  readonly kdf: "scrypt";
  readonly salt: string;
  readonly iv: string;
  readonly ciphertext: string;
}

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

export function sealKeyBackup(materialJson: string, passphrase: string): KeyBackupBlob {
  if (passphrase.trim().length < 10) {
    throw new Error("Use a recovery passphrase of at least 10 characters.");
  }
  const salt = randomBytes(16);
  const key = scryptSync(passphrase, salt, 32, SCRYPT);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(materialJson, "utf8"), cipher.final()]);
  const packed = Buffer.concat([body, cipher.getAuthTag()]);
  return {
    version: 1,
    kdf: "scrypt",
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    ciphertext: packed.toString("base64"),
  };
}

export function openKeyBackup(blob: KeyBackupBlob, passphrase: string): string {
  if (blob.version !== 1 || blob.kdf !== "scrypt") {
    throw new Error("This recovery backup uses a format this installation cannot open.");
  }
  const salt = Buffer.from(blob.salt, "base64");
  const iv = Buffer.from(blob.iv, "base64");
  const packed = Buffer.from(blob.ciphertext, "base64");
  if (salt.length < 16 || iv.length !== 12 || packed.length < 17) {
    throw new Error("Recovery data is incomplete.");
  }
  const key = scryptSync(passphrase, salt, 32, SCRYPT);
  const tag = packed.subarray(packed.length - 16);
  const body = packed.subarray(0, packed.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("That recovery passphrase did not unlock this device.");
  }
}
