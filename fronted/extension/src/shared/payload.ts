/**
 * Opaque text transport helpers.
 *
 * The backend relays ciphertext blobs and does not provide a verified client E2EE
 * contract for this extension. These helpers Base64-encode UTF-8 text for transport
 * and decode payloads that look like UTF-8. This is NOT end-to-end encryption.
 */

export function encodeOpaqueText(text: string): string {
  return Buffer.from(text, "utf8").toString("base64");
}

export function decodeOpaqueText(ciphertext: string): string {
  try {
    const normalized = ciphertext.replace(/\s+/g, "");
    const decoded = Buffer.from(normalized, "base64").toString("utf8");
    if (!decoded || hasUnsafeControlChars(decoded)) {
      return "[opaque payload]";
    }
    // Round-trip check: reject values that are not valid Base64 of this text.
    if (Buffer.from(decoded, "utf8").toString("base64") !== normalized) {
      return "[opaque payload]";
    }
    return decoded;
  } catch {
    return "[opaque payload]";
  }
}

function hasUnsafeControlChars(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31)) {
      return true;
    }
  }
  return false;
}
