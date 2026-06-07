import type { Server } from "../types/server";

// Placeholders a playbook step can reference; resolved per-target at run time
// so one playbook is reusable across many servers. Unknown placeholders are
// left untouched rather than silently dropped.
const VARIABLES: Record<string, (server: Server) => string> = {
  host: (s) => s.hostname,
  username: (s) => s.username,
  port: (s) => String(s.port),
  displayName: (s) => s.displayName,
};

export function resolvePlaybookStep(command: string, server: Server): string {
  return command.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) => {
    const resolve = VARIABLES[name];
    return resolve ? resolve(server) : match;
  });
}
