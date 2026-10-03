-- Up Migration
CREATE TABLE moderation_reports (
  id uuid PRIMARY KEY,
  match_id uuid NOT NULL,
  reporter_ref text NOT NULL,
  subject_ref text NOT NULL,
  reason text NOT NULL CHECK (reason IN ('inappropriate', 'harassment', 'spam', 'underage', 'abuse', 'other')),
  description text CHECK (char_length(description) <= 1000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  reviewed_at timestamptz,
  expires_at timestamptz NOT NULL,
  UNIQUE (match_id, reporter_ref),
  CHECK (expires_at > created_at)
);
CREATE INDEX reports_review_idx ON moderation_reports(status, created_at);
CREATE INDEX reports_retention_idx ON moderation_reports(expires_at);
CREATE TABLE bans (
  id uuid PRIMARY KEY,
  target_ref text NOT NULL,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at)
);
CREATE INDEX bans_target_idx ON bans(target_ref, expires_at) WHERE revoked_at IS NULL;
-- Down Migration
DROP TABLE bans;
DROP TABLE moderation_reports;
