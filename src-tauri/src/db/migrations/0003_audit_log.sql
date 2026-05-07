CREATE TABLE IF NOT EXISTS audit_log (
    id                  TEXT PRIMARY KEY NOT NULL,
    server_id           TEXT,
    server_display_name TEXT NOT NULL,
    hostname            TEXT NOT NULL,
    port                INTEGER NOT NULL,
    username            TEXT NOT NULL,
    outcome             TEXT NOT NULL DEFAULT 'connecting',
    error_message       TEXT,
    session_start       TEXT NOT NULL,
    session_end         TEXT,
    created_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_server ON audit_log(server_id);
CREATE INDEX IF NOT EXISTS idx_audit_start  ON audit_log(session_start);
