# MongoDB backups

Backups are not scheduled by this repository. An operator has to install the cron job or the aPanel scheduled task below.

## Frequency

Take a full dump every night and keep 30 daily copies. Take an extra copy before schema or application upgrades. This frequency is a recommendation, not an automatic setting.

## Storage

Write dumps to a directory that is not the MongoDB data volume, then copy them off the server. The database port is internal, so run `mongodump` from a container on the `social-internal` network or from a shell inside the MongoDB container.

Example from the server:

```bash
docker compose -f docker-compose.prod.yml exec -T mongodb \
  mongodump --uri "mongodb://USER:PASSWORD@127.0.0.1:27017/socialnetwork?authSource=admin" \
  --archive --gzip > /var/backups/socialnetwork-$(date -u +%Y%m%dT%H%M%SZ).archive.gz
```

Replace the URI with the production user and password. Do not put the password in the application source. Restrict the backup directory to the operator account and copy it to separate storage.

## Restore

Stop the API so clients do not write during the restore:

```bash
docker compose -f docker-compose.prod.yml stop backend
docker compose -f docker-compose.prod.yml exec -T mongodb \
  mongorestore --uri "mongodb://USER:PASSWORD@127.0.0.1:27017/?authSource=admin" \
  --archive --gzip --drop < /var/backups/socialnetwork-TIMESTAMP.archive.gz
docker compose -f docker-compose.prod.yml start backend
```

`--drop` replaces the restored collections. Confirm the backup file before running it.

## Retention

Delete local archives older than 30 days after the off-server copy has been checked. Test a restore on a spare machine at least once before relying on the backups. A dump that has never been restored is only a file.
