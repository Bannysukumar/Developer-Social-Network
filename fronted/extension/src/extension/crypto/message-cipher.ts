import { createCipheriv, createDecipheriv, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes } from "node:crypto";
import { privateKey, publicKey, verifySignedPreKey, type DeviceMaterial } from "./device-keys";

export interface RecipientBundle {
  readonly deviceId: string;
  readonly identityPublicKey: string;
  readonly signedPreKey: { readonly preKeyId: number; readonly publicKey: string; readonly signature: string };
  readonly oneTimePreKey?: { readonly preKeyId: number; readonly publicKey: string } | null;
}

interface DeviceSeal {
  readonly rid: string;
  readonly preKeyId: number;
  readonly eph: string;
  readonly iv: string;
  readonly ct: string;
  readonly tag: string;
}

interface Envelope {
  readonly v: 1;
  readonly cid: string;
  readonly sid: string;
  readonly preKeyId: number;
  readonly eph: string;
  readonly iv: string;
  readonly ct: string;
  readonly tag: string;
  readonly selfIv: string;
  readonly selfCt: string;
  readonly selfTag: string;
}

interface BundleEnvelope {
  readonly v: 2;
  readonly cid: string;
  readonly sid: string;
  readonly selfIv: string;
  readonly selfCt: string;
  readonly selfTag: string;
  readonly devices: readonly DeviceSeal[];
}

export function encryptForRecipient(plaintext: string, conversationId: string, sender: DeviceMaterial, recipient: RecipientBundle): string {
  return encryptForDevices(plaintext, conversationId, sender, [recipient]);
}

export function encryptForDevices(
  plaintext: string,
  conversationId: string,
  sender: DeviceMaterial,
  recipients: readonly RecipientBundle[],
): string {
  if (!sender.deviceId) {
    throw new Error("This device is not registered.");
  }
  if (recipients.length === 0) {
    throw new Error("This friend has not published a verified encryption key.");
  }
  const selfKey = derive(rawPrivate(sender.signedPreKeyPrivateJwk), "devconnect-self-v1");
  const selfSealed = seal(plaintext, selfKey, conversationId);
  const devices = recipients.map((recipient) => sealForRecipient(plaintext, conversationId, recipient));
  const envelope = {
    v: 2 as const,
    cid: conversationId,
    sid: sender.deviceId,
    selfIv: selfSealed.iv,
    selfCt: selfSealed.ct,
    selfTag: selfSealed.tag,
    devices,
  };
  return Buffer.from(JSON.stringify(envelope), "utf8").toString("base64");
}

export function decryptMessage(ciphertext: string, local: DeviceMaterial | undefined): string | undefined {
  const envelope = readEnvelope(ciphertext);
  if (!envelope || !local?.deviceId) return undefined;
  try {
    if (envelope.sid === local.deviceId) {
      const selfKey = derive(rawPrivate(local.signedPreKeyPrivateJwk), "devconnect-self-v1");
      return open(envelope.selfCt, envelope.selfIv, envelope.selfTag, selfKey, envelope.cid);
    }
    const targets: readonly DeviceSeal[] = envelope.v === 1
      ? [{ rid: "", preKeyId: envelope.preKeyId, eph: envelope.eph, iv: envelope.iv, ct: envelope.ct, tag: envelope.tag }]
      : envelope.devices;
    for (const target of targets) {
      const opened = openForDevice(target, local, envelope.cid);
      if (opened !== undefined) return opened;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function isEncryptedEnvelope(ciphertext: string): boolean {
  return readEnvelope(ciphertext) !== undefined;
}

function sealForRecipient(plaintext: string, conversationId: string, recipient: RecipientBundle): DeviceSeal {
  if (!verifySignedPreKey(recipient.identityPublicKey, recipient.signedPreKey.publicKey, recipient.signedPreKey.signature)) {
    throw new Error("The recipient key signature could not be verified.");
  }
  const remotePreKey = recipient.oneTimePreKey ?? recipient.signedPreKey;
  const ephemeral = generateKeyPairSync("x25519");
  const shared = diffieHellman({
    privateKey: ephemeral.privateKey,
    publicKey: publicKey("X25519", remotePreKey.publicKey),
  });
  const sealed = seal(plaintext, derive(shared, "devconnect-message-v1"), conversationId);
  const ephRaw = Buffer.from(ephemeral.publicKey.export({ format: "jwk" }).x ?? "", "base64url");
  return {
    rid: recipient.deviceId,
    preKeyId: remotePreKey.preKeyId,
    eph: ephRaw.toString("base64"),
    iv: sealed.iv,
    ct: sealed.ct,
    tag: sealed.tag,
  };
}

function openForDevice(target: DeviceSeal, local: DeviceMaterial, conversationId: string): string | undefined {
  const preKey = local.signedPreKeyId === target.preKeyId
    ? local.signedPreKeyPrivateJwk
    : local.oneTime.find((item) => item.id === target.preKeyId)?.privateJwk;
  if (!preKey) return undefined;
  try {
    const shared = diffieHellman({
      privateKey: privateKey(preKey),
      publicKey: publicKey("X25519", target.eph),
    });
    return open(target.ct, target.iv, target.tag, derive(shared, "devconnect-message-v1"), conversationId);
  } catch {
    return undefined;
  }
}

function readEnvelope(ciphertext: string): Envelope | BundleEnvelope | undefined {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(ciphertext, "base64").toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const value = parsed as {
      v?: number;
      cid?: string;
      sid?: string;
      selfCt?: string;
      eph?: string;
      ct?: string;
      devices?: unknown;
    };
    if (!value.cid || !value.sid || !value.selfCt) return undefined;
    if (value.v === 1 && value.eph && value.ct) return value as Envelope;
    if (value.v === 2 && Array.isArray(value.devices) && value.devices.length > 0) return value as BundleEnvelope;
    return undefined;
  } catch {
    return undefined;
  }
}

function seal(plaintext: string, key: Buffer, aad: string): { iv: string; ct: string; tag: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { iv: iv.toString("base64"), ct: ct.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}

function open(ct: string, iv: string, tag: string, key: Buffer, aad: string): string {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64")), decipher.final()]).toString("utf8");
}

function derive(input: Buffer, info: string): Buffer {
  return Buffer.from(hkdfSync("sha256", input, Buffer.alloc(0), Buffer.from(info, "utf8"), 32));
}

function rawPrivate(jwk: DeviceMaterial["signedPreKeyPrivateJwk"]): Buffer {
  return Buffer.from(jwk.d ?? "", "base64url");
}
