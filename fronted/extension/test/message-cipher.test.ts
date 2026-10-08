import { describe, expect, test } from "bun:test";
import { createDeviceMaterial, hasVerifiedSignedPreKey, verifySignedPreKey } from "../src/extension/crypto/device-keys";
import { decryptMessage, encryptForDevices, encryptForRecipient } from "../src/extension/crypto/message-cipher";

describe("device message encryption", () => {
  test("verifies the signed prekey and round-trips plaintext for both devices", () => {
    const alice = createDeviceMaterial();
    const bob = createDeviceMaterial();
    alice.deviceId = "alice-device";
    bob.deviceId = "bob-device";
    expect(verifySignedPreKey(alice.identityPublic, alice.signedPreKeyPublic, alice.signedPreKeySignature)).toBe(true);
    expect(hasVerifiedSignedPreKey({
      algorithm: "Ed25519",
      identityPublicKey: bob.identityPublic,
      signedPreKey: { publicKey: bob.signedPreKeyPublic, signature: bob.signedPreKeySignature },
    })).toBe(true);
    expect(hasVerifiedSignedPreKey({
      algorithm: "Ed25519",
      identityPublicKey: bob.identityPublic,
      signedPreKey: null,
    })).toBe(false);

    const ciphertext = encryptForRecipient("hello DevConnect", "conversation-1", alice, {
      deviceId: bob.deviceId,
      identityPublicKey: bob.identityPublic,
      signedPreKey: {
        preKeyId: bob.signedPreKeyId,
        publicKey: bob.signedPreKeyPublic,
        signature: bob.signedPreKeySignature,
      },
      oneTimePreKey: { preKeyId: bob.oneTime[0]!.id, publicKey: bob.oneTime[0]!.publicKey },
    });

    expect(ciphertext).not.toContain("hello DevConnect");
    const cara = createDeviceMaterial();
    cara.deviceId = "cara-device";
    const both = encryptForDevices("hello DevConnect", "conversation-1", alice, [
      {
        deviceId: bob.deviceId,
        identityPublicKey: bob.identityPublic,
        signedPreKey: {
          preKeyId: bob.signedPreKeyId,
          publicKey: bob.signedPreKeyPublic,
          signature: bob.signedPreKeySignature,
        },
      },
      {
        deviceId: cara.deviceId!,
        identityPublicKey: cara.identityPublic,
        signedPreKey: {
          preKeyId: cara.signedPreKeyId,
          publicKey: cara.signedPreKeyPublic,
          signature: cara.signedPreKeySignature,
        },
      },
    ]);
    expect(decryptMessage(both, bob)).toBe("hello DevConnect");
    expect(decryptMessage(both, cara)).toBe("hello DevConnect");
    expect(decryptMessage(ciphertext, bob)).toBe("hello DevConnect");
    expect(decryptMessage(ciphertext, alice)).toBe("hello DevConnect");
  });

  test("rejects a bundle whose signed prekey signature does not match", () => {
    const alice = createDeviceMaterial();
    const bob = createDeviceMaterial();
    alice.deviceId = "alice-device";
    expect(() => encryptForRecipient("secret", "conversation-1", alice, {
      deviceId: "bob-device",
      identityPublicKey: bob.identityPublic,
      signedPreKey: {
        preKeyId: bob.signedPreKeyId,
        publicKey: alice.signedPreKeyPublic,
        signature: bob.signedPreKeySignature,
      },
    })).toThrow("signature");
  });
});
