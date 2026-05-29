CREATE TABLE IF NOT EXISTS snippets (
    id         TEXT PRIMARY KEY NOT NULL,
    title      TEXT NOT NULL,
    body       TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
