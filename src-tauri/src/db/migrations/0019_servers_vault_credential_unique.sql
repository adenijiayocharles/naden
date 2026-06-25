-- Enforce one-credential-per-server atomically at the DB layer. The
-- application-level ownership check in create_server_db/update_server_db is
-- not atomic against concurrent writers; this index is the backstop that
-- actually closes the race (SQLite treats each NULL as distinct, so servers
-- with no credential don't conflict with one another).
CREATE UNIQUE INDEX IF NOT EXISTS idx_servers_vault_credential_unique
    ON servers(vault_credential_id)
    WHERE vault_credential_id IS NOT NULL;
