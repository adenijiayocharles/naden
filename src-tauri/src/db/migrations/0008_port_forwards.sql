CREATE TABLE port_forwards (
    id           TEXT    PRIMARY KEY NOT NULL,
    server_id    TEXT    NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    label        TEXT    NOT NULL DEFAULT '',
    forward_type TEXT    NOT NULL CHECK (forward_type IN ('local','remote','dynamic')),
    local_port   INTEGER NOT NULL,
    remote_host  TEXT    NOT NULL DEFAULT '',
    remote_port  INTEGER NOT NULL DEFAULT 0,
    auto_start   INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT    NOT NULL,
    updated_at   TEXT    NOT NULL
);

CREATE INDEX idx_port_forwards_server ON port_forwards(server_id);
