-- Up Migration
-- The operator's recent restrictions view needs chronological access too.
CREATE INDEX bans_admin_page_idx ON bans(created_at DESC) WHERE revoked_at IS NULL;
-- Down Migration
DROP INDEX bans_admin_page_idx;
