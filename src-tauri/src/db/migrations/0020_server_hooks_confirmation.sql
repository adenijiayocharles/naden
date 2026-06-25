-- Snapshot of the last hook text the user explicitly confirmed running.
-- Written only by the hook-confirmation flow (never by create/update server
-- payloads) so a connection re-prompts whenever a hook is new or edited.
ALTER TABLE servers ADD COLUMN pre_connect_hook_confirmed TEXT;
ALTER TABLE servers ADD COLUMN post_disconnect_hook_confirmed TEXT;
