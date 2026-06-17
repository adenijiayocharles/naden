ALTER TABLE servers ADD COLUMN env_vars TEXT;
ALTER TABLE servers ADD COLUMN pre_connect_hook TEXT;
ALTER TABLE servers ADD COLUMN post_disconnect_hook TEXT;
