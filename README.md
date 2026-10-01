# Trivexa Social Network Backend

Independent REST and WebSocket API for a social network. Clients such as a VS Code extension, a React web app, or a future mobile app talk to this service over HTTPS. The server never stores message plaintext or private encryption keys.

The Java runtime used to build and test this project is Java 17, the latest LTS available in the development environment. Spring Boot 3.5.16 is the final open-source 3.5 release.

## Features

- Signup, login, logout, short-lived JWT access tokens, and rotating refresh tokens
- Argon2id password hashing
- Public and private profiles, search, friend requests, friendships, and blocks
- One-to-one conversations and cursor-paginated ciphertext messages
- Authenticated WebSocket delivery at `/ws/chat`
- Public identity keys, signed prekeys, and one-time prekeys for a client-side protocol
- Device sessions, notifications, email verification, and password reset
- Consistent JSON errors, validation, rate limits, audit events, and Actuator health
- MongoDB, Docker, and OpenAPI UI

## Architecture

```
Clients
  |  HTTPS /api/v1 and WSS /ws/chat
Nginx or aPanel reverse proxy
  |  HTTP on the internal network
Spring Boot
  |  MongoDB protocol
MongoDB
```

Controllers validate input and call services. Services enforce privacy, relationship state, and ownership. Repositories only persist data. API responses use DTOs, so password hashes and token secrets are not returned.

See [docs/architecture.md](docs/architecture.md), [docs/security.md](docs/security.md), and [docs/e2ee.md](docs/e2ee.md).

## Technology

- Java 17
- Spring Boot 3.5.16
- Spring Security, Web, WebSocket, Validation, Data MongoDB, Actuator
- MongoDB 7
- JJWT for access tokens
- springdoc OpenAPI
- Optional Redis for shared rate limits
- JUnit 5, MockMvc, and Testcontainers

## Requirements

- JDK 17
- Maven 3.9, or `./mvnw` / `mvnw.cmd`
- Docker, for local MongoDB and for integration tests

If something else is already listening on port 27017, change the host port in `docker-compose.yml` and set `MONGODB_URI` to match. Keep the binding on `127.0.0.1` so MongoDB is not published on every interface.

## Local setup

1. Copy the environment template and keep the development profile:

```bash
cp .env.example .env
```

2. Start MongoDB. The port is bound to `127.0.0.1` only:

```bash
docker compose up -d
```

3. Run the API:

```bash
mvn spring-boot:run
```

The development profile connects to:

`mongodb://social:social_dev_password@localhost:27017/socialnetwork?authSource=admin`

The development JWT secret in `application.yml` is a local placeholder. Production startup rejects that value.

## URLs

- API base: `http://localhost:8080/api/v1`
- Swagger UI: `http://localhost:8080/swagger-ui.html`
- Health: `http://localhost:8080/actuator/health`
- WebSocket: `ws://localhost:8080/ws/chat`

Production must use `https://api.example.com` and `wss://api.example.com/ws/chat`. Replace `api.example.com` with the real domain. Do not send access tokens over plain HTTP outside local development.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `SPRING_PROFILES_ACTIVE` | `dev`, `test`, or `prod` |
| `MONGODB_URI` | Authenticated MongoDB connection string |
| `MONGO_INITDB_ROOT_USERNAME` / `MONGO_INITDB_ROOT_PASSWORD` | Database bootstrap user |
| `JWT_SECRET` | HMAC secret, at least 32 bytes |
| `JWT_ACCESS_EXPIRATION` | Access token lifetime, default `15m` |
| `JWT_REFRESH_EXPIRATION` | Refresh token lifetime, default `7d` |
| `CORS_ALLOWED_ORIGINS` | Comma-separated browser origins. Never `*` |
| `RATE_LIMIT_STORE` | `memory` or `redis` |
| `REDIS_URL` | Used only when the rate-limit store is `redis` |
| `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM` | SMTP. Empty host skips delivery |
| `APP_PUBLIC_URL` | Frontend origin used inside email links |
| `APP_SWAGGER_ENABLED` | Enable OpenAPI and Swagger UI |
| `TRUST_PROXY` | Trust `X-Forwarded-For` only behind the reverse proxy |
| `REQUIRE_EMAIL_VERIFIED` | When `true`, login requires a verified email |
| `UPLOAD_DIR` | Local profile-image directory |
| `SERVER_PORT` | API port, default `8080` |

## Tests

Integration tests start a MongoDB Testcontainers instance, so Docker must be running.

```bash
mvn test
```

## Docker

Local database:

```bash
docker compose up -d
```

Optional Redis, used only after `RATE_LIMIT_STORE=redis`:

```bash
docker compose --profile redis up -d
```

Production stack, with MongoDB kept off the public network and the API bound to localhost for aPanel:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Add `--profile nginx` when this repository's Nginx container should terminate TLS instead of aPanel.

## Production deployment

Follow [docs/deployment.md](docs/deployment.md). Backups are documented in [docs/backups.md](docs/backups.md) and are not configured automatically.

## Security and encryption

Passwords are hashed with Argon2id. Access tokens are signed JWTs. Refresh tokens are opaque, stored only as SHA-256 hashes, rotated on use, and family-revoked if a used token is presented again.

Message bodies are ciphertext supplied by the client. The server stores and forwards that ciphertext. It does not encrypt or decrypt messages, and it does not accept private keys. End-to-end encryption is complete only after a client implements and verifies a mature protocol such as the Signal protocol. See [docs/e2ee.md](docs/e2ee.md).

## API documentation

[docs/api.md](docs/api.md) has request and response examples. The running Swagger UI matches the controllers.
