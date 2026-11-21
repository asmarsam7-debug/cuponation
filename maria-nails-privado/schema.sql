PRAGMA foreign_keys=ON;
CREATE TABLE invites(id_hash TEXT PRIMARY KEY,email TEXT NOT NULL,expires INTEGER NOT NULL,revoked INTEGER NOT NULL DEFAULT 0);
CREATE TABLE challenges(id TEXT PRIMARY KEY,invite_hash TEXT NOT NULL,email TEXT NOT NULL,code_hash TEXT NOT NULL,expires INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,used INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,invite_hash TEXT NOT NULL,email TEXT NOT NULL,expires INTEGER NOT NULL,acceptance_id TEXT);
CREATE TABLE acceptances(id TEXT PRIMARY KEY,invite_hash TEXT NOT NULL,email TEXT NOT NULL,name TEXT NOT NULL,accepted_at TEXT NOT NULL,agreement_version TEXT NOT NULL,agreement_hash TEXT NOT NULL,agreement_html TEXT NOT NULL,acceptance_text TEXT NOT NULL,ip TEXT,user_agent TEXT,mail_status TEXT NOT NULL DEFAULT 'pending',mail_provider_id TEXT);
CREATE TABLE events(id TEXT PRIMARY KEY,acceptance_id TEXT NOT NULL,kind TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE rate_limits(key TEXT PRIMARY KEY,hits INTEGER NOT NULL);
CREATE INDEX challenge_invite ON challenges(invite_hash);
CREATE INDEX session_expiry ON sessions(expires);
CREATE INDEX events_acceptance ON events(acceptance_id);
-- Retain immutable acceptance snapshots. Restrict administrative DB access separately.
CREATE TRIGGER acceptance_no_delete BEFORE DELETE ON acceptances BEGIN SELECT RAISE(ABORT,'Acceptance snapshots are immutable'); END;
CREATE TRIGGER acceptance_no_edit BEFORE UPDATE OF name,email,accepted_at,agreement_version,agreement_hash,agreement_html,acceptance_text,ip,user_agent ON acceptances BEGIN SELECT RAISE(ABORT,'Acceptance snapshots are immutable'); END;
