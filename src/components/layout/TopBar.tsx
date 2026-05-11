import { useState, useRef } from "react";
import { useUiStore, type ViewMode, type SortMode } from "../../store/uiStore";
import { useVaultCountdown } from "../../lib/useVaultCountdown";
import SshConfigImport from "../servers/SshConfigImport";
import SettingsModal from "../settings/SettingsModal";

export default function TopBar() {
  const openAdd = useUiStore((s) => s.openAdd);
  const setSearch = useUiStore((s) => s.setSearch);
  const searchQuery = useUiStore((s) => s.searchQuery);
  const viewMode = useUiStore((s) => s.viewMode);
  const setViewMode = useUiStore((s) => s.setViewMode);
  const bulkMode = useUiStore((s) => s.bulkMode);
  const toggleBulkMode = useUiStore((s) => s.toggleBulkMode);
  const bulkSelected = useUiStore((s) => s.bulkSelected);
  const sortMode = useUiStore((s) => s.sortMode);
  const setSortMode = useUiStore((s) => s.setSortMode);
  const activeView = useUiStore((s) => s.activeView);
  const auditSearchQuery = useUiStore((s) => s.auditSearchQuery);
  const setAuditSearch = useUiStore((s) => s.setAuditSearch);
  const settingsOpen = useUiStore((s) => s.settingsOpen);
  const openSettings = useUiStore((s) => s.openSettings);
  const closeSettings = useUiStore((s) => s.closeSettings);
  const countdown = useVaultCountdown();
  const isAudit = activeView === "audit";
  const [showImport, setShowImport] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <header className="h-14 shrink-0 border-b border-stroke-subtle bg-surface-base flex items-center px-4 gap-3">
        {isAudit ? (
          <input
            value={auditSearchQuery}
            onChange={(e) => setAuditSearch(e.target.value)}
            placeholder="Search logs…"
            className="flex-1 min-w-0 max-w-sm h-8 bg-surface-3 border border-stroke rounded px-3 text-sm text-white placeholder-faint focus:outline-none focus:border-accent transition-colors"
          />
        ) : (
          <>
            <div className="relative flex-1 min-w-0 max-w-sm">
              <input
                ref={inputRef}
                data-search-input
                value={searchQuery}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search servers…"
                className="w-full h-8 bg-surface-3 border border-stroke rounded px-3 pr-12 text-sm text-white placeholder-faint focus:outline-none focus:border-accent transition-colors"
              />
              {!searchQuery && (
                <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-dim pointer-events-none select-none">
                  ⌘K
                </kbd>
              )}
            </div>

            {/* Bulk select */}
            <button
              onClick={toggleBulkMode}
              className={`px-2.5 py-1.5 rounded border text-xs transition-colors shrink-0 ${
                bulkMode
                  ? "bg-accent/10 border-accent/30 text-accent-fg"
                  : "bg-surface-3 border-stroke text-faint hover:text-muted"
              }`}
            >
              {bulkMode ? `Cancel${bulkSelected.length > 0 ? ` (${bulkSelected.length})` : ""}` : "Select"}
            </button>

            {/* Sort mode */}
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="h-8 bg-surface-3 border border-stroke rounded px-2 text-xs text-faint focus:outline-none focus:border-accent shrink-0 cursor-pointer"
            >
              <option value="default">Sort: Default</option>
              <option value="name_asc">Name A → Z</option>
              <option value="name_desc">Name Z → A</option>
              <option value="host">Host</option>
              <option value="last_connected">Last connected</option>
            </select>

            {/* View mode toggle */}
            <div className="flex items-center bg-surface-3 border border-stroke rounded overflow-hidden shrink-0">
              {(["card", "row"] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  aria-label={mode === "card" ? "Card view" : "List view"}
                  className={`p-1.5 transition-colors ${
                    viewMode === mode
                      ? "bg-surface-4 text-white"
                      : "text-faint hover:text-muted"
                  }`}
                >
                  {mode === "card" ? (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
                      <rect x="1" y="1" width="6" height="6" rx="1" />
                      <rect x="9" y="1" width="6" height="6" rx="1" />
                      <rect x="1" y="9" width="6" height="6" rx="1" />
                      <rect x="9" y="9" width="6" height="6" rx="1" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5}>
                      <line x1="1" y1="4" x2="15" y2="4" />
                      <line x1="1" y1="8" x2="15" y2="8" />
                      <line x1="1" y1="12" x2="15" y2="12" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="ml-auto flex items-center gap-2 shrink-0">
          {countdown && (
            <span
              title={`Vault locks in ${countdown.fmt()}`}
              className={`flex items-center gap-1 text-xs font-mono px-2 py-1 rounded border ${
                countdown.urgent
                  ? "bg-red-950/30 border-red-900/40 text-red-400"
                  : countdown.warning
                    ? "bg-yellow-950/30 border-yellow-900/40 text-yellow-400"
                    : "bg-surface-3 border-stroke text-faint"
              }`}
            >
              <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.8}>
                <rect x="5" y="1" width="6" height="3" rx="1" />
                <path strokeLinecap="round" d="M3 5.5A2.5 2.5 0 015.5 3h5A2.5 2.5 0 0113 5.5v7A2.5 2.5 0 0110.5 15h-5A2.5 2.5 0 013 12.5v-7z" />
              </svg>
              {countdown.fmt()}
            </span>
          )}
          <button
            onClick={() => setShowImport(true)}
            className="text-muted hover:text-accent text-sm px-3 py-1.5 rounded hover:bg-surface-3 transition-colors hidden sm:block"
          >
            Import SSH Config
          </button>
          <button
            onClick={openAdd}
            className="bg-accent hover:bg-accent-hover text-black text-sm font-semibold px-4 py-1.5 rounded transition-colors"
          >
            + Add Server
          </button>
          <button
            onClick={openSettings}
            className="text-muted hover:text-white p-1.5 rounded hover:bg-surface-3 transition-colors"
            aria-label="Settings"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </header>

      {showImport && <SshConfigImport onClose={() => setShowImport(false)} />}
      {settingsOpen && <SettingsModal onClose={closeSettings} />}
    </>
  );
}
