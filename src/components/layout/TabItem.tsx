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
  onDragStart,
  onDragOver,
  onDrop,
}: TabItemProps) {
  return (
    <div
      data-active={isActive ? "true" : undefined}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onActivate}
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
      <span className="max-w-[120px] truncate">{serverName}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="text-faint hover:text-white ml-1 leading-none transition-colors text-base"
        aria-label={closeLabel}
      >
        ×
      </button>
    </div>
  );
}
