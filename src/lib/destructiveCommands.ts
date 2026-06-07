// Commands that pause fan-out / playbook execution and require an explicit
// confirmation before being sent to a host.
const DESTRUCTIVE_PATTERNS = [
  /\brm\s+-rf\b/,
  /\bshutdown\b/,
  /\breboot\b/,
  /\bdd\s+if=/,
  /\bmkfs\b/,
];

export function isDestructiveCommand(data: string): boolean {
  return DESTRUCTIVE_PATTERNS.some((pattern) => pattern.test(data));
}
