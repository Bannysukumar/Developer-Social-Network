import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
  type JsonWebKey,
  type KeyObject,
} from "node:crypto";

const ONE_TIME_COUNT = 20;

export interface PreKeyRecord {
  readonly id: number;
  readonly publicKey: string;
  readonly privateJwk: JsonWebKey;
}

export interface DeviceMaterial {
  deviceId?: string;
  readonly identityPublic: string;
  readonly identityPrivateJwk: JsonWebKey;
  readonly signedPreKeyId: number;
  readonly signedPreKeyPublic: string;
  readonly signedPreKeySignature: string;
  readonly signedPreKeyPrivateJwk: JsonWebKey;
  readonly oneTime: readonly PreKeyRecord[];
}

export function createDeviceMaterial(): DeviceMaterial {
  const identity = generateKeyPairSync("ed25519");
  const signed = generateKeyPairSync("x25519");
  const signedPublic = rawPublic(signed.publicKey);
  const signature = sign(null, signedPublic, identity.privateKey);
  const oneTime: PreKeyRecord[] = [];
  for (let offset = 0; offset < ONE_TIME_COUNT; offset += 1) {
    const pair = generateKeyPairSync("x25519");
    oneTime.push({
      id: offset + 2,
      publicKey: rawPublic(pair.publicKey).toString("base64"),
      privateJwk: pair.privateKey.export({ format: "jwk" }),
    });
  }
  return {
    identityPublic: rawPublic(identity.publicKey).toString("base64"),
    identityPrivateJwk: identity.privateKey.export({ format: "jwk" }),
    signedPreKeyId: 1,
    signedPreKeyPublic: signedPublic.toString("base64"),
    signedPreKeySignature: signature.toString("base64"),
    signedPreKeyPrivateJwk: signed.privateKey.export({ format: "jwk" }),
    oneTime,
  };
}

export function verifySignedPreKey(identityPublic: string, signedPublic: string, signature: string): boolean {
  try {
    return verify(
      null,
      Buffer.from(signedPublic, "base64"),
      publicKey("Ed25519", identityPublic),
      Buffer.from(signature, "base64"),
    );
  } catch {
    return false;
  }
}

export function publicKey(algorithm: "Ed25519" | "X25519", standardBase64: string): KeyObject {
  const raw = Buffer.from(standardBase64, "base64");
  if (raw.length !== 32) {
    throw new Error("Public key has an unexpected length");
  }
  const jwk: JsonWebKey = {
    kty: "OKP",
    crv: algorithm === "Ed25519" ? "Ed25519" : "X25519",
    x: raw.toString("base64url"),
  };
  return createPublicKey({ key: jwk, format: "jwk" });
}

export function privateKey(jwk: JsonWebKey): KeyObject {
  return createPrivateKey({ key: jwk, format: "jwk" });
}

function rawPublic(key: KeyObject): Buffer {
  const jwk = key.export({ format: "jwk" });
  return Buffer.from(jwk.x ?? "", "base64url");
}
