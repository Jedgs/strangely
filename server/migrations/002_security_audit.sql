-- Up Migration
CREATE TABLE security_events (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  severity text NOT NULL CHECK (severity IN ('info','warning','critical')),
  code text NOT NULL CHECK (code ~ '^[A-Z_]{1,64}$'),
  network_ref text CHECK (network_ref ~ '^[a-f0-9]{64}$'),
  session_ref text CHECK (session_ref ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL
);
CREATE INDEX security_events_page_idx ON security_events(created_at DESC, id DESC);
CREATE INDEX security_events_retention_idx ON security_events(expires_at);
CREATE INDEX bans_retention_idx ON bans(expires_at);
CREATE INDEX reports_admin_page_idx ON moderation_reports(created_at DESC, id DESC);
-- Down Migration
DROP INDEX reports_admin_page_idx;
DROP INDEX bans_retention_idx;
DROP TABLE security_events;
