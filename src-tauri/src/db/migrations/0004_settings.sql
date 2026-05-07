CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
);
-- Seed defaults
INSERT OR IGNORE INTO settings (key, value) VALUES ('onboarding_complete', 'false');
INSERT OR IGNORE INTO settings (key, value) VALUES ('vault_timeout_minutes', '0');
