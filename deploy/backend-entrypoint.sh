#!/bin/sh
set -eu
uploads="${UPLOAD_DIR:-/data/uploads}"
mkdir -p "$uploads"
chown appuser:appuser "$uploads"
exec runuser --user appuser -- java -jar /app/app.jar
