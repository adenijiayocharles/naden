interface Props {
  menuRef: React.RefObject<HTMLDivElement>;
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  deleting: boolean;
  openingTerminal: boolean;
  openingBrowser: boolean;
  duplicating: boolean;
  checkingReachability: boolean;
  onEdit: () => void;
  onSystemTerminal: () => void;
  onBrowseFiles: () => void;
  onDuplicate: () => void;
  onCheckReachability: () => void;
  onDelete: () => void;
  buttonClassName?: string;
}

export default function ServerKebabMenu({
  menuRef, menuOpen, setMenuOpen,
  deleting, openingTerminal, openingBrowser, duplicating, checkingReachability,
  onEdit, onSystemTerminal, onBrowseFiles, onDuplicate, onCheckReachability, onDelete,
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
