CREATE TABLE IF NOT EXISTS playbooks (
    id          TEXT PRIMARY KEY NOT NULL,
    title       TEXT NOT NULL,
    description TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS playbook_steps (
    id          TEXT PRIMARY KEY NOT NULL,
    playbook_id TEXT NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    command     TEXT NOT NULL,
    delay_ms    INTEGER NOT NULL DEFAULT 400
);
