#!/bin/sh
set -eu

: "${APP_DATABASE_PASSWORD:?Set the separate application database password}"
# psql quotes the variable as a SQL literal; never interpolate it into SQL text.
psql --username "$POSTGRES_USER" --dbname postgres --set=ON_ERROR_STOP=1 --set=app_password="$APP_DATABASE_PASSWORD" <<'SQL'
CREATE ROLE commonroom LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'app_password';
CREATE DATABASE commonroom OWNER commonroom;
SQL
