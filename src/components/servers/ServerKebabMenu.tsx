import { useState } from "react";
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
  isFavourite: boolean;
  groups: Group[];
  currentGroupId?: string;
  onEdit: () => void;
  onSystemTerminal: () => void;
  onBrowseFiles: () => void;
  onToggleFavourite: () => void;
  onMoveToGroup: (groupId: string | null) => void;
  onDuplicate: () => void;
  onCheckReachability: () => void;
  onDelete: () => void;
  buttonClassName?: string;
}

export default function ServerKebabMenu({
  menuRef, menuOpen, setMenuOpen,
  isFavourite, groups, currentGroupId,
  deleting, openingTerminal, openingBrowser, duplicating, checkingReachability,
  onEdit, onSystemTerminal, onBrowseFiles, onToggleFavourite, onMoveToGroup,
  onDuplicate, onCheckReachability, onDelete,
  buttonClassName = "text-[#555] hover:text-white p-1 rounded hover:bg-[#1a1a1a] transition-colors text-lg leading-none",
}: Props) {
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const hasGroups = groups.length > 0;
  const isGrouped = Boolean(currentGroupId);

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
        <div className="absolute right-0 top-8 bg-[#161616] border border-[#2a2a2a] rounded-lg shadow-2xl z-20 min-w-[170px] py-1">
          <button
            onClick={onEdit}
            className="w-full text-left px-3 py-2 text-sm text-[#bbb] hover:bg-[#1e1e1e] hover:text-white transition-colors"
          >
            Edit
          </button>

          <button
            onClick={onToggleFavourite}
            className="w-full text-left px-3 py-2 text-sm text-[#bbb] hover:bg-[#1e1e1e] hover:text-white transition-colors flex items-center gap-2"
          >
            <svg className={`w-3.5 h-3.5 shrink-0 ${isFavourite ? "fill-yellow-400 text-yellow-400" : "fill-none text-[#777]"}`} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
            </svg>
            {isFavourite ? "Remove from Favourites" : "Add to Favourites"}
          </button>

          {/* Move to group — only shown when there are groups or the server is currently grouped */}
          {(hasGroups || isGrouped) && (
            <>
              <button
                onClick={() => setShowGroupPicker((v) => !v)}
                className="w-full text-left px-3 py-2 text-sm text-[#bbb] hover:bg-[#1e1e1e] hover:text-white transition-colors flex items-center justify-between"
              >
                <span>Move to Group</span>
                <svg className={`w-3 h-3 text-[#555] transition-transform ${showGroupPicker ? "rotate-180" : ""}`} fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2 4l4 4 4-4" />
                </svg>
              </button>

              {showGroupPicker && (
                <div className="border-t border-[#222] pt-1 pb-1">
                  {isGrouped && (
                    <button
                      onClick={() => { onMoveToGroup(null); setShowGroupPicker(false); }}
                      className="w-full text-left px-4 py-1.5 text-xs text-[#999] hover:bg-[#1e1e1e] hover:text-white transition-colors"
                    >
                      Ungrouped
                    </button>
                  )}
                  {groups.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => { onMoveToGroup(g.id); setShowGroupPicker(false); }}
                      className={`w-full text-left px-4 py-1.5 text-xs hover:bg-[#1e1e1e] hover:text-white transition-colors flex items-center gap-2 ${
                        g.id === currentGroupId ? "text-white font-medium" : "text-[#999]"
                      }`}
                    >
                      {g.color && (
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                      )}
                      {g.name}
                      {g.id === currentGroupId && <span className="ml-auto text-accent">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          <button
            onClick={onSystemTerminal}
            disabled={openingTerminal}
            className="w-full text-left px-3 py-2 text-sm text-[#bbb] hover:bg-[#1e1e1e] hover:text-white transition-colors disabled:opacity-40"
          >
            {openingTerminal ? "Opening…" : "System Terminal"}
          </button>
          <button
            onClick={onBrowseFiles}
            disabled={openingBrowser}
            className="w-full text-left px-3 py-2 text-sm text-[#bbb] hover:bg-[#1e1e1e] hover:text-white transition-colors disabled:opacity-40"
          >
            {openingBrowser ? "Connecting…" : "Browse Files"}
          </button>
          <button
            onClick={onDuplicate}
            disabled={duplicating}
            className="w-full text-left px-3 py-2 text-sm text-[#bbb] hover:bg-[#1e1e1e] hover:text-white transition-colors disabled:opacity-40"
          >
            {duplicating ? "Duplicating…" : "Duplicate"}
          </button>
          <button
            onClick={onCheckReachability}
            disabled={checkingReachability}
            className="w-full text-left px-3 py-2 text-sm text-[#bbb] hover:bg-[#1e1e1e] hover:text-white transition-colors disabled:opacity-40"
          >
            {checkingReachability ? "Checking…" : "Check Connectivity"}
          </button>
          <button
            onClick={onDelete}
            disabled={deleting}
            className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-[#1e1e1e] transition-colors disabled:opacity-40"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
