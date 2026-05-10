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

/** Relative time from an ISO timestamp, e.g. "3d ago", "just now". */
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
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
