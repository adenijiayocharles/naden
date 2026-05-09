import { useState, useRef, useEffect } from "react";
import type { Group } from "../../types/server";

interface Props {
  menuRef: React.RefObject<HTMLDivElement>;
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  deleting: boolean;
  openingTerminal: boolean;
  openingBrowser: boolean;
  duplicating: boolean;
  checkingReachability: boolean;
  canCopyPassword: boolean;
  groups: Group[];
  currentGroupId?: string;
  onEdit: () => void;
  onCopyPassword: () => void;
  onSystemTerminal: () => void;
  onBrowseFiles: () => void;
  onMoveToGroup: (groupId: string | null) => void;
  onDuplicate: () => void;
  onCheckReachability: () => void;
  onDelete: () => void;
  buttonClassName?: string;
  submenuLeft?: boolean;
}

export default function ServerKebabMenu({
  menuRef, menuOpen, setMenuOpen,
  canCopyPassword, groups, currentGroupId,
  deleting, openingTerminal, openingBrowser, duplicating, checkingReachability,
  onEdit, onCopyPassword, onSystemTerminal, onBrowseFiles, onMoveToGroup,
  onDuplicate, onCheckReachability, onDelete,
  buttonClassName = "text-faint hover:text-white p-1 rounded hover:bg-surface-3 transition-colors text-lg leading-none",
  submenuLeft = false,
}: Props) {
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const menuRef2 = useRef<HTMLDivElement>(null);
  const hasGroups = groups.length > 0;
  const isGrouped = Boolean(currentGroupId);

  // Keyboard navigation
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setMenuOpen(false); setShowGroupPicker(false); return; }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const items = menuRef2.current?.querySelectorAll<HTMLElement>("button:not(:disabled)");
      if (!items?.length) return;
      const focused = document.activeElement as HTMLElement;
      const idx = Array.from(items).indexOf(focused);
      const next = e.key === "ArrowDown"
        ? items[(idx + 1) % items.length]
        : items[(idx - 1 + items.length) % items.length];
      next.focus();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [menuOpen, setMenuOpen]);

  return (
    <div
      className="relative shrink-0"
      ref={menuRef}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={() => { setMenuOpen(!menuOpen); setShowGroupPicker(false); }}
        className={buttonClassName}
        aria-label="Server options"
      >
        ⋮
      </button>

      {menuOpen && (
        <div ref={menuRef2} className="absolute right-0 top-8 bg-surface-2 border border-stroke rounded-lg shadow-2xl z-20 min-w-[170px] py-1">
          <button
            onClick={onEdit}
            className="w-full text-left px-3 py-2 text-sm text-secondary hover:bg-surface-4 hover:text-white transition-colors"
          >
            Edit
          </button>
          {canCopyPassword && (
            <button
              onClick={onCopyPassword}
              className="w-full text-left px-3 py-2 text-sm text-secondary hover:bg-surface-4 hover:text-white transition-colors flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5 shrink-0 text-faint" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.8}>
                <rect x="3" y="1" width="10" height="14" rx="1.5" />
                <path strokeLinecap="round" d="M6 1v2h4V1" />
              </svg>
              Copy Password
            </button>
          )}

          {/* Move to group — submenu opens to the right */}
          {(hasGroups || isGrouped) && (
            <div className="relative">
              <button
                onClick={() => setShowGroupPicker((v) => !v)}
                className="w-full text-left px-3 py-2 text-sm text-secondary hover:bg-surface-4 hover:text-white transition-colors flex items-center justify-between"
              >
                <span>Move to Group</span>
                <svg className="w-3 h-3 text-faint" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 2l4 4-4 4" />
                </svg>
              </button>

              {showGroupPicker && (
                <div className={`absolute top-0 ${submenuLeft ? "right-full mr-1" : "left-full ml-1"} bg-surface-2 border border-stroke rounded-lg shadow-2xl z-30 min-w-[150px] py-1`}>
                  {isGrouped && (
                    <button
                      onClick={() => { onMoveToGroup(null); setShowGroupPicker(false); }}
                      className="w-full text-left px-3 py-1.5 text-xs text-muted hover:bg-surface-4 hover:text-white transition-colors"
                    >
                      Ungrouped
                    </button>
                  )}
                  {groups.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => { onMoveToGroup(g.id); setShowGroupPicker(false); }}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-surface-4 hover:text-white transition-colors flex items-center gap-2 ${
                        g.id === currentGroupId ? "text-white font-medium" : "text-muted"
                      }`}
                    >
                      {g.color && (
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                      )}
                      {g.name}
                      {g.id === currentGroupId && <span className="ml-auto pl-3 text-accent">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            onClick={onSystemTerminal}
            disabled={openingTerminal}
            className="w-full text-left px-3 py-2 text-sm text-secondary hover:bg-surface-4 hover:text-white transition-colors disabled:opacity-40"
          >
            {openingTerminal ? "Opening…" : "System Terminal"}
          </button>
          <button
            onClick={onBrowseFiles}
            disabled={openingBrowser}
            className="w-full text-left px-3 py-2 text-sm text-secondary hover:bg-surface-4 hover:text-white transition-colors disabled:opacity-40"
          >
            {openingBrowser ? "Connecting…" : "Browse Files"}
          </button>
          <button
            onClick={onDuplicate}
            disabled={duplicating}
            className="w-full text-left px-3 py-2 text-sm text-secondary hover:bg-surface-4 hover:text-white transition-colors disabled:opacity-40"
          >
            {duplicating ? "Duplicating…" : "Duplicate"}
          </button>
          <button
            onClick={onCheckReachability}
            disabled={checkingReachability}
            className="w-full text-left px-3 py-2 text-sm text-secondary hover:bg-surface-4 hover:text-white transition-colors disabled:opacity-40"
          >
            {checkingReachability ? "Checking…" : "Check Connectivity"}
          </button>
          <button
            onClick={onDelete}
            disabled={deleting}
            className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-surface-4 transition-colors disabled:opacity-40"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
