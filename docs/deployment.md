# Deployment

This deployment targets a Linux server with Docker and aPanel. The sample hostname is `api.example.com`. Replace it. Do not commit the real `.env`.

## 1. Upload the project

Copy this repository to the server, for example `/opt/social-network-backend`. Do not copy `target/`, `.tools/`, or a local `.env` that contains development secrets.

## 2. Configure environment variables

```bash
cp .env.example .env
```

Set at least:

- `SPRING_PROFILES_ACTIVE=prod`
- `MONGODB_URI=mongodb://USER:PASSWORD@mongodb:27017/socialnetwork?authSource=admin`
- `MONGO_INITDB_ROOT_USERNAME` and `MONGO_INITDB_ROOT_PASSWORD` to the same database user
- `JWT_SECRET` to a new random value of 32 bytes or more
- `CORS_ALLOWED_ORIGINS` to the real web and extension origins, comma-separated, never `*`
- `APP_PUBLIC_URL=https://app.example.com`
- `TRUST_PROXY=true`
- SMTP values if email verification or password reset should actually send mail

Inside Compose, the MongoDB hostname is `mongodb`, not `localhost`.

## 3. Build and start

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

MongoDB has no published port. The API listens on `127.0.0.1:8080` only.

To use the bundled Nginx container instead of aPanel's proxy:

```bash
docker compose -f docker-compose.prod.yml --profile nginx up -d --build
```

Place the certificate at `deploy/nginx/certs/fullchain.pem` and the key at `deploy/nginx/certs/privkey.pem`. Edit `server_name` in `deploy/nginx/nginx.conf`.

## 4. aPanel domain and HTTPS

1. Create a site or reverse-proxy site for `api.example.com`.
2. Issue a certificate with aPanel's Let's Encrypt or upload a certificate. Production authentication must use HTTPS.
3. Proxy `https://api.example.com` to `http://127.0.0.1:8080`.
4. Forward WebSocket upgrades. A working Nginx snippet is:

```nginx
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;
    client_max_body_size 2m;
}
```

5. Leave port 27017 closed on the public firewall.

## 5. Verify

```bash
curl -fsS http://127.0.0.1:8080/actuator/health
curl -fsS https://api.example.com/actuator/health
```

Then check:

- `https://api.example.com/swagger-ui.html`
- signup and login over HTTPS
- a WebSocket connection to `wss://api.example.com/ws/chat` with a bearer token
- `docker compose -f docker-compose.prod.yml restart backend` and confirm MongoDB data is still present after the API comes back

Swagger is enabled by default so this check is possible. Set `APP_SWAGGER_ENABLED=false` if the public API should not expose the UI, or protect that path in the proxy.

## Certificates

aPanel normally terminates TLS. The Spring process itself speaks HTTP on localhost. `server.forward-headers-strategy` is enabled in the production profile so the app sees `https` from `X-Forwarded-Proto`. Renew the certificate before it expires. The bundled Nginx profile reads PEM files from `deploy/nginx/certs` and redirects port 80 to 443.

## Persistence

The Compose file mounts named volume `mongodb_data`. Restarting containers does not remove it. `docker compose down -v` does. Do not use that command on a production server unless you intend to destroy the database.
