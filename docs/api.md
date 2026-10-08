# API

Base path: `/api/v1`.

Successful responses:

```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": {}
}
```

Errors:

```json
{
  "success": false,
  "message": "Validation failed",
  "errorCode": "VALIDATION_ERROR",
  "timestamp": "2026-10-01T12:00:00Z",
  "path": "/api/v1/auth/signup",
  "details": []
}
```

Protected routes use `Authorization: Bearer <accessToken>`.

## Signup

`POST /api/v1/auth/signup`

```json
{
  "username": "ada",
  "email": "ada@example.com",
  "password": "Sup3rSecret",
  "displayName": "Ada Lovelace"
}
```

Returns `201` and an `AuthResponse` with `accessToken`, `refreshToken`, expirations, and the user profile. The profile includes email for the owner only. It never includes `passwordHash`.

## Login

`POST /api/v1/auth/login`

```json
{
  "usernameOrEmail": "ada",
  "password": "Sup3rSecret",
  "device": {
    "deviceName": "VS Code",
    "platform": "EXTENSION"
  }
}
```

`device` is optional. A wrong password returns `401` and `Invalid username or password`.

## Refresh and logout

`POST /api/v1/auth/refresh`

```json
{ "refreshToken": "rt_..." }
```

The previous refresh token cannot be used again.

`POST /api/v1/auth/logout` requires the access token and the refresh token. The current access token is revoked.

## Password and email

- `POST /api/v1/auth/change-password` with `currentPassword` and `newPassword`. All sessions are revoked.
- `POST /api/v1/auth/forgot-password` with `email`. The response does not reveal whether the mailbox exists.
- `POST /api/v1/auth/reset-password` with `token` and `newPassword`.
- `POST /api/v1/auth/verify-email` with `token`.
- `POST /api/v1/auth/resend-verification` for the authenticated user.

Email links place the token in the URL fragment (`#token=`) so it is not sent to the web server as a query string. The client reads the fragment and posts it to the API.

## Profile and search

- `GET /api/v1/users/me`
- `PUT /api/v1/users/me` replaces `displayName`, `bio`, and `accountType`
- `PATCH /api/v1/users/me` updates any of those fields
- `POST /api/v1/users/me/avatar` multipart field `file`, JPEG, PNG, or WebP, max 2 MB
- `GET /api/v1/users/{userId}`
- `GET /api/v1/users/search?q=ada&page=0&size=20`
- `DELETE /api/v1/users/me` with `{ "password": "..." }`

A private account returns `limited: true` and omits bio from non-friends. A block returns `404`.

## Friends and blocks

- `POST /api/v1/friend-requests/{userId}`
- `GET /api/v1/friend-requests/incoming?page=0&size=20`
- `GET /api/v1/friend-requests/outgoing?page=0&size=20`
- `POST /api/v1/friend-requests/{requestId}/accept`
- `POST /api/v1/friend-requests/{requestId}/reject`
- `DELETE /api/v1/friend-requests/{requestId}`
- `GET /api/v1/friends`
- `DELETE /api/v1/friends/{userId}`
- `POST /api/v1/users/{userId}/block`
- `DELETE /api/v1/users/{userId}/block`
- `GET /api/v1/users/{userId}/block-status`

Only friends can open a conversation. Users cannot friend or message across a block.

## Conversations and messages

`POST /api/v1/conversations`

```json
{ "participantId": "507f1f77bcf86cd799439011" }
```

`POST /api/v1/conversations/{conversationId}/messages`

```json
{
  "ciphertext": "b3BhcXVlLXBheWxvYWQ=",
  "messageType": "TEXT",
  "clientMessageId": "client-msg-1",
  "deviceId": "optional-device-id",
  "keyId": "optional-key-id"
}
```

`messageType` may be `TEXT`, `IMAGE`, or `FILE`. `SYSTEM` is rejected. `GET .../messages?limit=30&cursor=` returns newest messages first. The cursor loads the next older page.

`PATCH /api/v1/messages/{messageId}/read` is recipient-only.

`DELETE /api/v1/messages/{messageId}?scope=me` or `scope=everyone`.

## Notifications

- `GET /api/v1/notifications?page=0&size=20`
- `POST /api/v1/notifications/{notificationId}/read`
- `POST /api/v1/notifications/read-all`

## Devices and keys

- `GET /api/v1/devices`
- `DELETE /api/v1/devices/{deviceId}`
- `POST /api/v1/keys/identity`
- `POST /api/v1/keys/prekeys`
- `GET /api/v1/keys/{userId}`
- `DELETE /api/v1/keys/devices/{deviceId}`

Identity registration:

```json
{
  "deviceName": "VS Code",
  "platform": "EXTENSION",
  "algorithm": "Ed25519",
  "publicKey": "<standard Base64 of 32 bytes>"
}
```

`platform` is `WEB`, `DESKTOP`, `IOS`, `ANDROID`, `EXTENSION`, or `UNKNOWN`.

## WebSocket

`/ws/chat` is not a REST endpoint. The handshake accepts `Authorization: Bearer <access token>`. The server also accepts `access_token` on the query string; the extension must not put a token in the URL. Frames are `{ "type", "data" }`.

| Event | Direction | Payload | Authentication | Authorization | Example |
| --- | --- | --- | --- | --- | --- |
| `PING` | client | none | Bearer on the socket | the signed-in user | `{ "type": "PING" }` |
| `PONG` | server | empty object | same socket | same user | `{ "type": "PONG", "data": {} }` |
| `READY` | server | `userId` | same socket | sent once after the socket is registered | `{ "type": "READY", "data": { "userId": "..." } }` |
| `SEND` | client | ciphertext fields plus `conversationId` | same socket | friends who are not blocked, and a member of the conversation | `{ "type": "SEND", "conversationId": "...", "ciphertext": "..." }` |
| `MESSAGE` | server | message object | same socket | the sender and the recipient | `{ "type": "MESSAGE", "data": { "id": "...", "status": "SENT" } }` |
| `DELIVERED` | both | client sends `messageId`; server sends the ack | same socket | only the recipient can acknowledge | `{ "type": "DELIVERED", "messageId": "..." }` |
| `READ` | both | client sends `messageId`; server sends the ack | same socket | only the recipient can mark that message read | `{ "type": "READ", "messageId": "..." }` |
| `NOTIFICATION` | server | same object as `GET /notifications` | same socket | the notification recipient | `{ "type": "NOTIFICATION", "data": { "type": "FRIEND_REQUEST" } }` |
| `PRESENCE_UPDATE` | server | `userId`, `status` (`ONLINE` or `OFFLINE`), optional `lastSeenAt` | same socket | friends, when activity status is on and neither user blocked the other. Offline last seen is not sent to non-friends | `{ "type": "PRESENCE_UPDATE", "data": { "userId": "...", "status": "ONLINE" } }` |
| `TYPING_START` | both | `conversationId`, and the server adds `userId` | same socket | conversation member, friends, not blocked. Not stored | `{ "type": "TYPING_START", "conversationId": "..." }` |
| `TYPING_STOP` | both | same as start | same socket | same as start | `{ "type": "TYPING_STOP", "conversationId": "..." }` |
| `ERROR` | server | `errorCode`, `message` | same socket | the sender of the rejected frame | `{ "type": "ERROR", "data": { "errorCode": "FORBIDDEN" } }` |

## Health

`GET /actuator/health` returns a status without component details.
