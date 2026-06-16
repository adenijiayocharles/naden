import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/button";

interface TabItemProps {
  serverName: string;
  statusColor: string;
  isActive: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  title: string;
  icon?: React.ReactNode;
  closeLabel: string;
  onActivate: () => void;
  onClose: () => void;
  onRename?: (name: string) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

export default function TabItem({
  serverName,
  statusColor,
  isActive,
  isDragging,
  isDragOver,
  title,
  icon,
  closeLabel,
  onActivate,
  onClose,
  onRename,
  onDragStart,
  onDragOver,
  onDrop,
}: TabItemProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming) {
      setDraft(serverName);
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [isRenaming, serverName]);

  const commitRename = () => {
    setIsRenaming(false);
    onRename?.(draft);
  };

  const cancelRename = () => {
    setIsRenaming(false);
  };

  return (
    <div
      data-active={isActive ? "true" : undefined}
      draggable={!isRenaming}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={isRenaming ? undefined : onActivate}
      title={title}
      className={`relative flex items-center gap-2 px-4 py-2.5 rounded text-base cursor-pointer shrink-0 transition-colors duration-200 ease-premium select-none ${
        isActive
          ? "bg-surface-2 text-accent-fg"
          : "text-muted hover:text-white hover:bg-surface-2"
      } ${isDragging ? "opacity-40" : ""} ${
        isDragOver ? "ring-1 ring-inset ring-accent/50" : ""
      }`}
    >
      {isActive && (
        <span aria-hidden="true" className="absolute inset-x-3 bottom-0.5 h-0.5 rounded-full bg-accent" />
      )}
      <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${statusColor}`} />
      {icon}
      {isRenaming ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commitRename(); }
            if (e.key === "Escape") { e.preventDefault(); cancelRename(); }
            e.stopPropagation();
          }}
          onClick={(e) => e.stopPropagation()}
          className="max-w-[120px] min-w-[60px] bg-transparent border-b border-accent outline-none text-white text-sm"
          aria-label="Rename tab"
        />
      ) : (
        <span
          className="max-w-[120px] truncate"
          onDoubleClick={onRename ? (e) => { e.stopPropagation(); setIsRenaming(true); } : undefined}
        >
          {serverName}
        </span>
      )}
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="text-faint hover:text-white ml-1 leading-none text-base"
        aria-label={closeLabel}
      >
        ×
      </Button>
    </div>
  );
}
