/** Joins path segments, collapsing any runs of consecutive slashes. */
export function joinPath(...segments: string[]): string {
  return segments.join("/").replace(/\/+/g, "/");
}

/** Returns the parent directory of a path. Returns "/" for root. */
export function parentPath(path: string): string {
  const trimmed = path.endsWith("/") && path !== "/" ? path.slice(0, -1) : path;
  const parent = trimmed.split("/").slice(0, -1).join("/");
  return parent || "/";
}
