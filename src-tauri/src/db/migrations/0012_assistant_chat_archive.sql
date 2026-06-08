CREATE TABLE assistant_chat_archive (
    server_id     TEXT    PRIMARY KEY NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    credential_id TEXT    NOT NULL,
    updated_at    INTEGER NOT NULL
);
