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

`/ws/chat`

Client frames: `PING`, `SEND`, `DELIVERED`, `READ`.

`SEND` uses the same ciphertext fields as the REST message body plus `conversationId`. Server frames are `READY`, `MESSAGE`, `DELIVERED`, `READ`, `PONG`, `ERROR`, and `NOTIFICATION`. A `NOTIFICATION` frame uses the same object as a notification in `GET /notifications`. There is no presence topic and no typing frame.

## Health

`GET /actuator/health` returns a status without component details.
