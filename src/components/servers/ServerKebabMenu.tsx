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
}

export default function ServerKebabMenu({
  menuRef, menuOpen, setMenuOpen,
  canCopyPassword, groups, currentGroupId,
  deleting, openingTerminal, openingBrowser, duplicating, checkingReachability,
  onEdit, onCopyPassword, onSystemTerminal, onBrowseFiles, onMoveToGroup,
  onDuplicate, onCheckReachability, onDelete,
  buttonClassName = "text-[#555] hover:text-white p-1 rounded hover:bg-[#1a1a1a] transition-colors text-lg leading-none",
}: Props) {
  const hasGroups = groups.length > 0;
  const isGrouped = Boolean(currentGroupId);

  return (
    <div
      className="relative shrink-0"
      ref={menuRef}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={() => { setMenuOpen(!menuOpen); }}
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
          {canCopyPassword && (
            <button
              onClick={onCopyPassword}
              className="w-full text-left px-3 py-2 text-sm text-[#bbb] hover:bg-[#1e1e1e] hover:text-white transition-colors flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5 shrink-0 text-[#666]" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.8}>
                <rect x="3" y="1" width="10" height="14" rx="1.5" />
                <path strokeLinecap="round" d="M6 1v2h4V1" />
              </svg>
              Copy Password
            </button>
          )}

          {/* Move to group — only shown when there are groups or the server is currently grouped */}
          {(hasGroups || isGrouped) && (
            <div className="border-t border-[#222] pt-1 pb-1">
              <p className="px-3 py-1 text-xs text-[#555] uppercase tracking-wider">Move to Group</p>
              {isGrouped && (
                <button
                  onClick={() => onMoveToGroup(null)}
                  className="w-full text-left px-3 py-1.5 text-xs text-[#999] hover:bg-[#1e1e1e] hover:text-white transition-colors"
                >
                  Ungrouped
                </button>
              )}
              {groups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => onMoveToGroup(g.id)}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[#1e1e1e] hover:text-white transition-colors flex items-center gap-2 ${
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
