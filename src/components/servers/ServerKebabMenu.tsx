interface Props {
  menuRef: React.RefObject<HTMLDivElement>;
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  confirmDelete: boolean;
  setConfirmDelete: (v: boolean) => void;
  deleting: boolean;
  openingTerminal: boolean;
  openingBrowser: boolean;
  onEdit: () => void;
  onSystemTerminal: () => void;
  onBrowseFiles: () => void;
  onDelete: () => void;
  buttonClassName?: string;
}

export default function ServerKebabMenu({
  menuRef, menuOpen, setMenuOpen,
  confirmDelete, setConfirmDelete,
  deleting, openingTerminal, openingBrowser,
  onEdit, onSystemTerminal, onBrowseFiles, onDelete,
  buttonClassName = "text-[#555] hover:text-white p-1 rounded hover:bg-[#1a1a1a] transition-colors text-lg leading-none",
}: Props) {
  return (
    <div
      className="relative shrink-0"
      ref={menuRef}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className={buttonClassName}
        aria-label="Server options"
      >
        ⋮
      </button>

      {menuOpen && (
        <div className="absolute right-0 top-8 bg-[#161616] border border-[#2a2a2a] rounded-lg shadow-2xl z-20 min-w-[150px] py-1">
          <button
            onClick={onEdit}
            className="w-full text-left px-3 py-2 text-sm text-[#bbb] hover:bg-[#1e1e1e] hover:text-white transition-colors"
          >
            Edit
          </button>
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
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-[#1e1e1e] transition-colors"
            >
              Delete
            </button>
          ) : (
            <div className="px-3 py-2 border-t border-[#2a2a2a]">
              <p className="text-xs text-[#bbb] mb-2">Delete this server?</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs text-[#777] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={onDelete}
                  disabled={deleting}
                  className="text-xs text-red-400 hover:text-red-300 font-semibold"
                >
                  {deleting ? "…" : "Delete"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
