import { describe, expect, test } from "bun:test";
import { createDeviceMaterial } from "../src/extension/crypto/device-keys";
import { openKeyBackup, sealKeyBackup } from "../src/extension/crypto/key-backup";
import { decryptMessage, encryptForDevices, isEncryptedEnvelope, SEALED_MESSAGE_TEXT } from "../src/extension/crypto/message-cipher";

function recipientBundle(material: ReturnType<typeof createDeviceMaterial>, deviceId: string) {
  return {
    deviceId,
    identityPublicKey: material.identityPublic,
    signedPreKey: {
      preKeyId: material.signedPreKeyId,
      publicKey: material.signedPreKeyPublic,
      signature: material.signedPreKeySignature,
    },
  };
}

describe("cross-device key recovery", () => {
  test("a fresh device can read history after restoring the original key", () => {
    const sender = createDeviceMaterial();
    sender.deviceId = "laptop";
    const friend = createDeviceMaterial();
    const ciphertext = encryptForDevices("see you Thursday", "conv-1", sender, [recipientBundle(friend, "friend-phone")]);
    const backup = sealKeyBackup(JSON.stringify(sender), "correct horse battery");
    const restored = JSON.parse(openKeyBackup(backup, "correct horse battery"));
    delete restored.deviceId;
    expect(decryptMessage(ciphertext, restored)).toBe("see you Thursday");
    expect(isEncryptedEnvelope(ciphertext)).toBe(true);
  });

  test("a message sealed to an old device and this device opens on this device", () => {
    const sender = createDeviceMaterial();
    sender.deviceId = "friend";
    const previous = createDeviceMaterial();
    previous.deviceId = "old-laptop";
    const current = createDeviceMaterial();
    current.deviceId = "this-laptop";
    const ciphertext = encryptForDevices("sent just now", "conv-1", sender, [
      recipientBundle(previous, "old-laptop"),
      recipientBundle(current, "this-laptop"),
    ]);
    expect(decryptMessage(ciphertext, current)).toBe("sent just now");
    expect(decryptMessage(ciphertext, previous)).toBe("sent just now");
  });

  test("a one-time seal still opens after the device key is reloaded", () => {
    const sender = createDeviceMaterial();
    sender.deviceId = "friend";
    const recipient = createDeviceMaterial();
    recipient.deviceId = "this-laptop";
    const restored = JSON.parse(JSON.stringify(recipient)) as typeof recipient;
    const ciphertext = encryptForDevices("11:49 message", "conv-1", sender, [{
      deviceId: "this-laptop",
      identityPublicKey: recipient.identityPublic,
      signedPreKey: {
        preKeyId: recipient.signedPreKeyId,
        publicKey: recipient.signedPreKeyPublic,
        signature: recipient.signedPreKeySignature,
      },
      oneTimePreKey: { preKeyId: recipient.oneTime[0].id, publicKey: recipient.oneTime[0].publicKey },
    }]);
    expect(decryptMessage(ciphertext, restored)).toBe("11:49 message");
  });

  test("the recipient device still decrypts with its own key", () => {
    const sender = createDeviceMaterial();
    sender.deviceId = "laptop";
    const friend = createDeviceMaterial();
    friend.deviceId = "friend-phone";
    const ciphertext = encryptForDevices("hello", "conv-1", sender, [recipientBundle(friend, "friend-phone")]);
    expect(decryptMessage(ciphertext, friend)).toBe("hello");
  });

  test("a new key cannot open history and the placeholder stays honest", () => {
    const sender = createDeviceMaterial();
    sender.deviceId = "laptop";
    const friend = createDeviceMaterial();
    const ciphertext = encryptForDevices("old history", "conv-1", sender, [recipientBundle(friend, "friend-phone")]);
    const replacement = createDeviceMaterial();
    replacement.deviceId = "new-laptop";
    expect(decryptMessage(ciphertext, replacement)).toBeUndefined();
    expect(SEALED_MESSAGE_TEXT.includes("sealed to another installation")).toBe(true);
    expect(SEALED_MESSAGE_TEXT).not.toBe("Encrypted message");
  });

  test("the wrong recovery passphrase is rejected", () => {
    const backup = sealKeyBackup('{"signedPreKeyPrivateJwk":{"d":"abc"}}', "correct horse battery");
    expect(() => openKeyBackup(backup, "wrong passphrase")).toThrow("did not unlock");
  });

  test("tampered backup ciphertext is rejected", () => {
    const backup = sealKeyBackup("device-key", "correct horse battery");
    const body = Buffer.from(backup.ciphertext, "base64");
    body[0] ^= 0xff;
    expect(() => openKeyBackup({ ...backup, ciphertext: body.toString("base64") }, "correct horse battery")).toThrow("did not unlock");
  });
});
