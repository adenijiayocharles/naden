import { useState, useRef } from "react";
import { useUiStore } from "../../store/uiStore";
import SshConfigImport from "../servers/SshConfigImport";
import SettingsModal from "../settings/SettingsModal";

export default function TopBar() {
  const openAdd = useUiStore((s) => s.openAdd);
  const setSearch = useUiStore((s) => s.setSearch);
  const searchQuery = useUiStore((s) => s.searchQuery);
  const [showImport, setShowImport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <header className="h-14 shrink-0 border-b border-[#1e1e1e] bg-[#0d0d0d] flex items-center px-4 gap-3">
        <input
          ref={inputRef}
          value={searchQuery}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search servers…"
          className="flex-1 max-w-sm bg-[#1a1a1a] border border-[#2a2a2a] rounded px-3 py-1.5 text-sm text-white placeholder-[#666] focus:outline-none focus:border-accent transition-colors"
        />
        <button
          onClick={() => setShowImport(true)}
          className="text-[#888] hover:text-accent text-sm px-3 py-1.5 rounded hover:bg-[#1a1a1a] transition-colors shrink-0"
        >
          Import SSH Config
        </button>
        <button
          onClick={openAdd}
          className="bg-accent hover:bg-accent-hover text-black text-sm font-semibold px-4 py-1.5 rounded transition-colors shrink-0"
        >
          + Add Server
        </button>
        <button
          onClick={() => setShowSettings(true)}
          className="text-[#888] hover:text-white p-1.5 rounded hover:bg-[#1a1a1a] transition-colors shrink-0"
          aria-label="Settings"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </header>

      {showImport && <SshConfigImport onClose={() => setShowImport(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </>
  );
}
