/** Mirrors CSS Grid's `repeat(auto-fill, minmax(minItemWidth, 1fr))` column count for a given container width. */
export function computeColumnCount(width: number, minItemWidth: number, gap: number): number {
  if (width <= 0) return 1;
  return Math.max(1, Math.floor((width + gap) / (minItemWidth + gap)));
}

export function chunkIntoRows<T>(items: T[], columns: number): T[][] {
  if (columns <= 1) return items.map((item) => [item]);
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += columns) {
    rows.push(items.slice(i, i + columns));
  }
  return rows;
}
