export interface ArrowSelectResult {
  selected: string[];
  anchorPath: string;
  cursorPath: string;
  cursorIndex: number;
}

// Finder/Explorer shift+arrow semantics: the anchor stays fixed while the
// cursor walks one row toward `direction`; selection always spans
// [anchor, cursor] inclusive, so walking back past the anchor shrinks it.
export function arrowSelect(
  paths: string[],
  anchorPath: string | null,
  cursorPath: string | null,
  direction: 1 | -1,
): ArrowSelectResult | null {
  if (paths.length === 0) return null;

  if (!anchorPath || !cursorPath) {
    const index = direction === 1 ? 0 : paths.length - 1;
    return { selected: [paths[index]], anchorPath: paths[index], cursorPath: paths[index], cursorIndex: index };
  }

  const anchorIndex = paths.indexOf(anchorPath);
  const cursorIndex = paths.indexOf(cursorPath);
  if (anchorIndex === -1 || cursorIndex === -1) return null;

  const nextIndex = Math.max(0, Math.min(paths.length - 1, cursorIndex + direction));
  const [start, end] = anchorIndex <= nextIndex ? [anchorIndex, nextIndex] : [nextIndex, anchorIndex];
  return { selected: paths.slice(start, end + 1), anchorPath, cursorPath: paths[nextIndex], cursorIndex: nextIndex };
}
