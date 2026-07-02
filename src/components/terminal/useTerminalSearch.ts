import { useState, useRef, useCallback, useEffect } from "react";
import type { Terminal } from "@xterm/xterm";
import type { SearchAddon } from "@xterm/addon-search";

interface SearchResult {
  index: number | undefined;
  count: number;
}

interface Params {
  termRef: React.RefObject<Terminal | null>;
  searchAddonRef: React.RefObject<SearchAddon | null>;
}

export function useTerminalSearch({ termRef, searchAddonRef }: Params) {
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null);

  // Ref mirrors so xterm's stale key-handler closure always reads the latest values.
  const searchQueryRef = useRef("");
  const lastFoundRef = useRef<{ col: number; row: number } | null>(null);
  const searchVisibleRef = useRef(false);

  useEffect(() => { searchVisibleRef.current = searchVisible; }, [searchVisible]);

  const closeSearch = useCallback(() => {
    setSearchVisible(false);
    setSearchQuery("");
    searchQueryRef.current = "";
    setSearchResults(null);
    lastFoundRef.current = null;
  }, []);

  const findNext = useCallback(() => {
    const term = termRef.current;
    const addon = searchAddonRef.current;
    const q = searchQueryRef.current;
    if (!q || !addon) return;
    // Restore selection if SSH output cleared it so the addon knows where to advance from.
    if (term && !term.hasSelection() && lastFoundRef.current) {
      term.select(lastFoundRef.current.col, lastFoundRef.current.row, q.length);
    }
    addon.findNext(q, { incremental: false });
    const pos = term?.getSelectionPosition();
    if (pos) lastFoundRef.current = { col: pos.start.x - 1, row: pos.start.y - 1 };
  }, [termRef, searchAddonRef]);

  const findPrevious = useCallback(() => {
    const term = termRef.current;
    const addon = searchAddonRef.current;
    const q = searchQueryRef.current;
    if (!q || !addon) return;
    if (term && !term.hasSelection() && lastFoundRef.current) {
      term.select(lastFoundRef.current.col, lastFoundRef.current.row, q.length);
    }
    addon.findPrevious(q);
    const pos = term?.getSelectionPosition();
    if (pos) lastFoundRef.current = { col: pos.start.x - 1, row: pos.start.y - 1 };
  }, [termRef, searchAddonRef]);

  return {
    searchVisible, setSearchVisible,
    searchQuery, setSearchQuery,
    searchResults, setSearchResults,
    searchQueryRef, lastFoundRef, searchVisibleRef,
    closeSearch, findNext, findPrevious,
  };
}
