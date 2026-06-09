CREATE TABLE IF NOT EXISTS ssh_keys (
    id           TEXT    PRIMARY KEY,
    name         TEXT    NOT NULL,
    key_path     TEXT    NOT NULL UNIQUE,
    key_type     TEXT    NOT NULL DEFAULT 'unknown',
    fingerprint  TEXT    NOT NULL DEFAULT '',
    comment      TEXT    NOT NULL DEFAULT '',
    is_encrypted INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT    NOT NULL,
    updated_at   TEXT    NOT NULL
);
