ALTER TABLE servers ADD COLUMN is_favourite INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_servers_favourite ON servers(is_favourite);
