CREATE TABLE IF NOT EXISTS vault_meta (
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
);
-- Stores: 'pbkdf2_salt' (base64) and 'verification' (base64 of SHA256(derived_key || domain))
