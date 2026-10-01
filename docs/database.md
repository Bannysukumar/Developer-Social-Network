# Database

MongoDB database: `socialnetwork` in the local and production examples. Integration tests use the Testcontainers database.

Indexes are created from document annotations and from `MongoIndexInitializer` when the application starts (`spring.data.mongodb.auto-index-creation=true`).

## users

Account records.

Important fields: `username`, `normalizedUsername`, `email`, `normalizedEmail`, `passwordHash`, `displayName`, `normalizedDisplayName`, `bio`, `profileImageFileId`, `accountType` (`PUBLIC` or `PRIVATE`), `status` (`ACTIVE`, `SUSPENDED`, `DELETED`), `roles`, `emailVerified`, `sessionValidAfter`, timestamps, `lastLoginAt`.

Indexes: unique `normalizedUsername`, unique `normalizedEmail`, `normalizedDisplayName`, `status`.

Retention: deleted accounts are anonymized and kept so existing message sender ids still resolve to a tombstone. Do not expose `passwordHash`.

## refreshTokens

Hashed refresh tokens. Fields include `userId`, `tokenHash`, `familyId`, `deviceId`, `expiresAt`, `revoked`, `replacedByTokenId`.

Indexes: unique `tokenHash`, `userId`, `familyId`, `deviceId`, TTL on `expiresAt`.

## revokedAccessTokens

Access token ids revoked before expiry. TTL on `expiresAt`.

## revokedTokenFamilies

Refresh families revoked after reuse. The access-token filter rejects those family ids. TTL on `expiresAt`.

## friendRequests

`senderId`, `recipientId`, `status` (`PENDING`, `ACCEPTED`, `REJECTED`, `CANCELLED`), timestamps.

Indexes: recipient/status/created, sender/status/created, and a partial unique index on sender plus recipient where status is `PENDING`.

## relationships

One document per accepted friendship. `userAId` and `userBId` are sorted so the pair is unique.

## blocks

Directional block from `blockerId` to `blockedId`, unique per pair. Either direction suppresses interaction.

## conversations

`type` is `ONE_TO_ONE`. `participantIds` has two ids. `participantKey` is the sorted pair and is unique.

## messages

`ciphertext`, `messageType`, `status` (`SENT`, `DELIVERED`, `READ`), sender, recipient, optional `clientMessageId`, `deviceId`, `keyId`, delivery timestamps, `deletedForEveryone`, `deletedForUserIds`.

Indexes: conversation/created/`_id` for cursor pagination, recipient/status for reconnect delivery, and a partial unique index on conversation, sender, and `clientMessageId` when that id exists.

Ciphertext cleared for everyone is an empty string. That is a storage deletion, not cryptographic deletion.

## notifications

`recipientId`, `type`, `actorId`, `referenceId`, `message`, `read`, `createdAt`. The message is a server-written description such as "You received a new encrypted message". It is not chat plaintext.

Indexes: recipient/created and recipient/read.

## devices

`userId`, `deviceName`, `platform`, optional public identity key, `revoked`, timestamps. Index: user/revoked.

## identityKeys

One public identity key per device. Unique `deviceId`. Index on `userId`.

## preKeys

Signed and one-time public prekeys. Unique device plus `preKeyId`. Index on device, type, and consumed. Consumed one-time prekeys older than 30 days are deleted by the scheduler.

## emailVerificationTokens and passwordResetTokens

Store SHA-256 token hashes, expiry, and a used flag. TTL on `expiresAt`. Verification tokens last 24 hours. Reset tokens last 1 hour. Both are single-use.

## auditEvents

Security events with user id, type, IP, truncated user agent, and a small metadata map. No secrets.

## storedFiles

Profile-image metadata. Bytes live on the filesystem under `UPLOAD_DIR`, named by the file id. The collection stores owner, detected content type, size, and storage key.

## Consistency

Accepting a friend request, rotating a refresh token, consuming a one-time prekey, and consuming a reset token use `findAndModify` so two concurrent callers cannot both win. Unique indexes close the remaining races for friendships, pending requests, conversations, and client message ids.

These operations are safe on a standalone MongoDB node. They are not a multi-document transaction. If the process stops after a request is marked accepted and before the friendship insert, a retry of the accept fails because the request is no longer pending, and the friendship can be created by a later successful path only if the request is still pending. Operational recovery for that narrow crash window is to re-send or manually insert the missing friendship pair. A replica set with a transaction around those two writes would remove that window and is the recommended production topology when the operator can run one.

## Backups

See [backups.md](backups.md).
