ALTER TABLE servers ADD COLUMN sort_position INTEGER NOT NULL DEFAULT 0;

-- Initialise from current display_name order so existing users keep what they see.
UPDATE servers
SET sort_position = (
    SELECT COUNT(*)
    FROM servers s2
    WHERE s2.display_name < servers.display_name
       OR (s2.display_name = servers.display_name AND s2.id < servers.id)
);

CREATE INDEX IF NOT EXISTS idx_servers_sort_position ON servers(sort_position);
