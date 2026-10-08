#!/bin/sh
set -eu
mkdir -p /app/uploads
chown appuser:appuser /app/uploads
exec runuser --user appuser -- java -jar /app/app.jar
