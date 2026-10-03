#!/bin/sh
set -eu

: "${REDIS_PASSWORD:?Set a random Redis password}"
case "$REDIS_PASSWORD" in
  *[!a-fA-F0-9]*) echo 'Redis password must be hexadecimal' >&2; exit 1 ;;
esac
if [ "${#REDIS_PASSWORD}" -lt 64 ]; then
  echo 'Redis password must contain at least 64 random hexadecimal characters' >&2
  exit 1
fi
# Keep the secret out of argv and output; the official entrypoint drops privileges.
umask 077
printf 'bind 0.0.0.0\nprotected-mode yes\nport 6379\nsave ""\nappendonly no\nrequirepass %s\n' "$REDIS_PASSWORD" > /tmp/commonroom-redis.conf
chown redis:redis /tmp/commonroom-redis.conf
exec /usr/local/bin/docker-entrypoint.sh redis-server /tmp/commonroom-redis.conf
