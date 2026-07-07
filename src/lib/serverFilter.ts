import type { Server } from "../types/server";

export function applyActiveFilter(
  list: Server[],
  filterFavourites: boolean,
  filterGroupId: string | null,
  filterTagId: string | null,
): Server[] {
  if (filterFavourites) return list.filter((s) => s.isFavourite);
  if (filterGroupId) return list.filter((s) => s.groupId === filterGroupId);
  if (filterTagId) return list.filter((s) => s.tags.some((t) => t.id === filterTagId));
  return list;
}
