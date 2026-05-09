/** user@host or user@host:port — omits port 22 and empty username. */
export function formatHost(server: { username: string; hostname: string; port: number }): string {
  const prefix = server.username ? `${server.username}@` : "";
  const suffix = server.port !== 22 ? `:${server.port}` : "";
  return `${prefix}${server.hostname}${suffix}`;
}

/** Human-readable file size. Returns "—" for directories. */
export function formatSize(bytes: number, isDir: boolean): string {
  if (isDir) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

/** Locale date string from a Unix timestamp (seconds). Returns "—" for null. */
export function formatDate(ts: number | null): string {
  if (ts == null) return "—";
  return new Date(ts * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
