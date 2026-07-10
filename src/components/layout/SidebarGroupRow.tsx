import { useState } from "react";
import { ContextMenuPopup, MenuItem } from "../sftp/SftpFileList";
import type { Group } from "../../types/server";

export default function GroupRow({
  group,
  active,
  count,
  onClick,
  onEdit,
  onDelete,
}: {
  group: Group;
  active: boolean;
  count: number;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <>
      <div
        onContextMenu={handleContextMenu}
        className={`flex items-center rounded transition-colors ${active ? "bg-accent" : "hover:bg-surface-3"}`}
      >
        <button
          onClick={onClick}
          className={`flex-1 min-w-0 text-left px-3 py-2 text-sm flex items-center justify-between transition-colors ${
            active ? "text-black font-medium" : "text-secondary hover:text-white"
          }`}
        >
          <span className="flex items-center gap-2 min-w-0 truncate">
            {group.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: group.color }} />}
            <span className="truncate">{group.name}</span>
          </span>
          <span className={`text-xs ml-2 shrink-0 ${active ? "text-black/60" : "text-muted"}`}>{count}</span>
        </button>
      </div>

      {menu && (
        <ContextMenuPopup x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          <MenuItem onClick={() => { onEdit(); setMenu(null); }}>Edit</MenuItem>
          <MenuItem danger onClick={() => { onDelete(); setMenu(null); }}>Delete</MenuItem>
        </ContextMenuPopup>
      )}
    </>
  );
}
