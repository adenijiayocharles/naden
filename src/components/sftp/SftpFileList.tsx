import { useRef } from "react";
import type { FileEntry } from "../../types/sftp";
import { formatSize, formatDate } from "../../lib/format";

interface Props {
  entries: FileEntry[];
  selected: string[];
  renaming: string | null;
  renameValue: string;
  onSelect: (path: string, meta: boolean, shift: boolean) => void;
  onNavigate: (entry: FileEntry) => void;
  onRenameChange: (value: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  onRenameStart: (path: string) => void;
}

function FileIcon({ isDir }: { isDir: boolean }) {
  if (isDir) {
    return (
      <svg className="w-4 h-4 text-accent-fg shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4 text-faint shrink-0" fill="currentColor" viewBox="0 0 20 20">
      <path
        fillRule="evenodd"
        d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export default function SftpFileList({
  entries,
  selected,
  renaming,
  renameValue,
  onSelect,
  onNavigate,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onRenameStart,
}: Props) {
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-dim text-sm">
        Empty directory
      </div>
    );
  }

  const handleRowClick = (entry: FileEntry, e: React.MouseEvent) => {
    const meta = e.metaKey || e.ctrlKey;
    const shift = e.shiftKey;
    onSelect(entry.path, meta, shift);
  };

  const handleRowDoubleClick = (entry: FileEntry) => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    if (entry.isDir) {
      onNavigate(entry);
    } else {
      onRenameStart(entry.path);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 bg-surface-0 z-10">
          <tr className="text-faint text-xs uppercase tracking-wider">
            <th className="text-left px-4 py-2 font-medium w-1/2">Name</th>
            <th className="text-right px-4 py-2 font-medium w-24">Size</th>
            <th className="text-right px-4 py-2 font-medium">Modified</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const isSelected = selected.includes(entry.path);
            const isRenaming = renaming === entry.path;

            return (
              <tr
                key={entry.path}
                onClick={(e) => handleRowClick(entry, e)}
                onDoubleClick={() => handleRowDoubleClick(entry)}
                className={`cursor-pointer border-b border-stroke-subtle transition-colors select-none ${
                  isSelected
                    ? "bg-accent/10 text-accent-fg"
                    : "text-secondary hover:bg-surface-2 hover:text-white"
                }`}
              >
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <FileIcon isDir={entry.isDir} />
                    {isRenaming ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => onRenameChange(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Enter") onRenameCommit();
                          if (e.key === "Escape") onRenameCancel();
                        }}
                        onBlur={onRenameCommit}
                        className="flex-1 h-6 bg-surface-3 border border-accent rounded px-1.5 text-xs text-white outline-none font-mono min-w-0"
                      />
                    ) : (
                      <span className="truncate font-mono text-xs" title={entry.name}>
                        {entry.name}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2 text-right text-faint font-mono text-xs tabular-nums">
                  {formatSize(entry.size, entry.isDir)}
                </td>
                <td className="px-4 py-2 text-right text-faint text-xs">
                  {formatDate(entry.modified)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
