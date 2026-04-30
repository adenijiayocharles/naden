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
      <header className="h-14 shrink-0 border-b border-gray-700 bg-gray-800 flex items-center px-4 gap-3">
        <input
          ref={inputRef}
          value={searchQuery}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search servers…"
          className="flex-1 max-w-sm bg-gray-700 border border-gray-600 rounded-md px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
        />
        <button
          onClick={() => setShowImport(true)}
          className="text-gray-400 hover:text-white text-sm px-3 py-1.5 rounded-md hover:bg-gray-700 transition-colors shrink-0"
        >
          Import SSH Config
        </button>
        <button
          onClick={openAdd}
          className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-1.5 rounded-md transition-colors shrink-0"
        >
          + Add Server
        </button>
      </header>

      {showImport && <SshConfigImport onClose={() => setShowImport(false)} />}
    </>
  );
}
