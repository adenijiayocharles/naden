import { useState, useRef } from "react";
import { useUiStore } from "../../store/uiStore";
import SshConfigImport from "../servers/SshConfigImport";

export default function TopBar() {
  const openAdd = useUiStore((s) => s.openAdd);
  const setSearch = useUiStore((s) => s.setSearch);
  const searchQuery = useUiStore((s) => s.searchQuery);
  const [showImport, setShowImport] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <header className="h-14 shrink-0 border-b border-[#1e1e1e] bg-[#0d0d0d] flex items-center px-4 gap-3">
        <input
          ref={inputRef}
          value={searchQuery}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search servers…"
          className="flex-1 max-w-sm bg-[#1a1a1a] border border-[#2a2a2a] rounded px-3 py-1.5 text-sm text-white placeholder-[#444] focus:outline-none focus:border-accent transition-colors"
        />
        <button
          onClick={() => setShowImport(true)}
          className="text-[#666] hover:text-accent text-sm px-3 py-1.5 rounded hover:bg-[#1a1a1a] transition-colors shrink-0"
        >
          Import SSH Config
        </button>
        <button
          onClick={openAdd}
          className="bg-accent hover:bg-accent-hover text-black text-sm font-semibold px-4 py-1.5 rounded transition-colors shrink-0"
        >
          + Add Server
        </button>
      </header>

      {showImport && <SshConfigImport onClose={() => setShowImport(false)} />}
    </>
  );
}
