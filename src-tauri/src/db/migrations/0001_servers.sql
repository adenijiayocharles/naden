CREATE TABLE IF NOT EXISTS groups (
    id          TEXT PRIMARY KEY NOT NULL,
    name        TEXT NOT NULL UNIQUE,
    color       TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS servers (
    id                  TEXT PRIMARY KEY NOT NULL,
    display_name        TEXT NOT NULL,
    hostname            TEXT NOT NULL,
    port                INTEGER NOT NULL DEFAULT 22,
    username            TEXT NOT NULL DEFAULT '',
    auth_method         TEXT NOT NULL DEFAULT 'key',  -- 'key' | 'password' | 'agent'
    identity_file_path  TEXT,
    vault_credential_id TEXT,   -- keyring lookup key; never the actual credential
    group_id            TEXT REFERENCES groups(id) ON DELETE SET NULL,
    notes               TEXT,
    is_jump_host        INTEGER NOT NULL DEFAULT 0,
    jump_host_id        TEXT REFERENCES servers(id) ON DELETE SET NULL,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
    id    TEXT PRIMARY KEY NOT NULL,
    name  TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS server_tags (
    server_id  TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    tag_id     TEXT NOT NULL REFERENCES tags(id)    ON DELETE CASCADE,
    PRIMARY KEY (server_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_servers_group    ON servers(group_id);
CREATE INDEX IF NOT EXISTS idx_servers_hostname ON servers(hostname);
