-- Phonix audit log schema
-- Runs automatically on first postgres container start via
-- /docker-entrypoint-initdb.d/ mount.
--
-- DPDP compliance:
--   • file_key_hash and ip_hash are SHA-256 hashes — raw values never stored.
--   • No audio, transcript, or personal data in this table.
--   • Retained for compliance audit trail.

CREATE TABLE IF NOT EXISTS audit_log (
    id             bigserial    PRIMARY KEY,
    event_type     text         NOT NULL,
    file_key_hash  text         NOT NULL,
    ip_hash        text         NOT NULL,
    metadata       jsonb        NOT NULL DEFAULT '{}',
    occurred_at    timestamptz  NOT NULL DEFAULT now()
);

-- Index for compliance queries: "show all events for this session"
CREATE INDEX IF NOT EXISTS idx_audit_file_key ON audit_log (file_key_hash);
CREATE INDEX IF NOT EXISTS idx_audit_occurred ON audit_log (occurred_at DESC);

-- No row-level access from the app — only the service account writes rows.
-- Direct SELECT is available for compliance officers with DB access.
COMMENT ON TABLE audit_log IS
    'DPDP 2023 audit trail. Hashed identifiers only — no raw PII.';
