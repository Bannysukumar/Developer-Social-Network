# Encryption architecture

This backend is not a complete end-to-end encrypted messenger. It is the server half of one.

## Three different layers

| Layer | What it protects | Where it ends |
| --- | --- | --- |
| Transport encryption | The HTTP and WebSocket connection | The reverse proxy and the Spring Boot process |
| Server-side hashing | Passwords at rest | The password hash. This is not message encryption |
| End-to-end encryption | Message contents between clients | Only the clients that hold the private keys |

TLS protects tokens and ciphertext in transit. It does not make the server unable to read a payload. If a client sends plaintext, TLS still delivers that plaintext to the server. This API rejects a `plaintext` field and requires Base64 `ciphertext`, but it cannot prove that the Base64 bytes were produced by a secure protocol.

## What the server stores

- Public identity keys for `Ed25519` or `X25519`, exactly 32 decoded bytes
- Signed prekey public keys and a 64-byte signature blob
- One-time prekey public keys
- Device ids and public key ids
- Message ciphertext, at most 48,000 decoded bytes

The server does not generate message keys, does not accept a private key field, and does not log ciphertext or key material.

For an Ed25519 identity key, a signed prekey is accepted only when its 64-byte signature verifies over the raw 32-byte signed-prekey public key. X25519 identity keys are still length-checked only, because that algorithm does not sign. Clients also verify the signature before encrypting. This is not the Signal protocol.

## Intended client flow

1. Each device generates its own identity key pair and keeps the private key in client storage.
2. `POST /api/v1/keys/identity` registers the public key and device.
3. `POST /api/v1/keys/prekeys` uploads one signed prekey and up to 100 unused one-time prekeys.
4. A friend calls `GET /api/v1/keys/{userId}`. The response includes public identity keys, the signed prekey, and one unused one-time prekey per device. That one-time prekey is then marked consumed. Fetching your own bundle does not consume prekeys.
5. The sender's client performs the protocol handshake and encrypts the message.
6. `POST /api/v1/conversations/{id}/messages` or a WebSocket `SEND` frame submits ciphertext.
7. The recipient's client downloads or receives the ciphertext and decrypts it locally.

The server will deliver the same ciphertext to a friend whether or not the client actually performed a secure handshake. Completing that handshake is a client requirement.

## Sessions and devices

A user can have up to 10 active devices. Revoking a device deletes its public identity key and prekeys and revokes refresh tokens issued for that device. A message that was already decrypted on a revoked device is outside the server's control.

## Deletion

`DELETE /api/v1/messages/{id}?scope=me` hides the message from the caller.

`DELETE /api/v1/messages/{id}?scope=everyone` can be called by the sender. The server clears the stored ciphertext and sends a tombstone. This is ordinary data deletion. It does not delete plaintext that a recipient already decrypted, and it does not provide cryptographic erasure.

## What is not implemented

- No Signal, MLS, or Olm session state
- No private-key backup
- No server-side sealed sender
- No group messaging
- No attachment blobs larger than the ciphertext limit

Large files should be encrypted by the client and stored in object storage later. MongoDB is not the blob store.
