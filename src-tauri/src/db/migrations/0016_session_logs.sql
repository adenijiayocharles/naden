CREATE TABLE IF NOT EXISTS session_logs (
    id                  TEXT PRIMARY KEY NOT NULL,
    server_id           TEXT,
    server_display_name TEXT NOT NULL,
    file_path           TEXT NOT NULL,
    start_time          TEXT NOT NULL,
    end_time            TEXT,
    file_size_bytes     INTEGER,
    created_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_logs_server ON session_logs(server_id);
CREATE INDEX IF NOT EXISTS idx_session_logs_start  ON session_logs(start_time);
