import { useState } from "react";
import { ContextMenuPopup, MenuItem } from "../sftp/SftpFileList";
import type { Tag } from "../../types/server";

export default function TagRow({
  tag,
  active,
  count,
  onClick,
  onRename,
  onDelete,
}: {
  tag: Tag;
  active: boolean;
  count: number;
  onClick: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  return (
    <>
      <button
        onClick={onClick}
        onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }); }}
        className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between rounded transition-colors ${
          active ? "bg-accent text-black font-medium" : "text-secondary hover:bg-surface-3 hover:text-white"
        }`}
      >
        <span className="truncate">#{tag.name}</span>
        <span className={`text-xs ml-2 shrink-0 ${active ? "text-black/60" : "text-muted"}`}>{count}</span>
      </button>

      {menu && (
        <ContextMenuPopup x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          <MenuItem onClick={() => { onRename(); setMenu(null); }}>Rename</MenuItem>
          <MenuItem danger onClick={() => { onDelete(); setMenu(null); }}>Delete</MenuItem>
        </ContextMenuPopup>
      )}
    </>
  );
}
