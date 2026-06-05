CREATE TABLE vault_credentials (
    id         TEXT PRIMARY KEY NOT NULL,
    nonce      BLOB NOT NULL,
    ciphertext BLOB NOT NULL
);
