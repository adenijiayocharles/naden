import { useState } from "react";
import { useServerStore } from "../../store/serverStore";
import { buttonVariants } from "../ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "../ui/dropdown-menu";
import { cn } from "../../lib/utils";

interface Props {
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  deleting: boolean;
  openingTerminal: boolean;
  openingBrowser: boolean;
  duplicating: boolean;
  checkingReachability: boolean;
  canCopyPassword: boolean;
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
  buttonSize?: "icon-xs" | "icon-sm" | "icon";
}

export default function ServerKebabMenu({
  menuOpen, setMenuOpen,
  canCopyPassword, currentGroupId,
  deleting, openingTerminal, openingBrowser, duplicating, checkingReachability,
  onEdit, onCopyPassword, onSystemTerminal, onBrowseFiles, onMoveToGroup,
  onDuplicate, onCheckReachability, onDelete,
  buttonClassName = "text-faint hover:text-white hover:bg-surface-3 transition-colors",
  buttonSize = "icon-xs",
}: Props) {
  const groups = useServerStore((s) => s.groups);
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const hasGroups = groups.length > 0;
  const isGrouped = Boolean(currentGroupId);

  return (
    <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
      <DropdownMenu
        open={menuOpen}
        onOpenChange={(open) => { setMenuOpen(open); if (!open) setShowGroupPicker(false); }}
      >
        <DropdownMenuTrigger
          className={cn(buttonVariants({ variant: "ghost", size: buttonSize }), buttonClassName)}
          aria-label="Server options"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
            <circle cx="7" cy="2" r="1.25" />
            <circle cx="7" cy="7" r="1.25" />
            <circle cx="7" cy="12" r="1.25" />
          </svg>
        </DropdownMenuTrigger>

        <DropdownMenuContent>
          <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
          {canCopyPassword && (
            <DropdownMenuItem onClick={onCopyPassword} className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 shrink-0 text-faint" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5}>
                <rect x="3" y="1" width="10" height="14" rx="1.5" />
                <path strokeLinecap="round" d="M6 1v2h4V1" />
              </svg>
              Copy Password
            </DropdownMenuItem>
          )}

          {(hasGroups || isGrouped) && (
            <div>
              <DropdownMenuItem
                closeOnClick={false}
                onClick={() => setShowGroupPicker((v) => !v)}
                className="flex items-center justify-between"
              >
                <span>Move to Group</span>
                <svg
                  className={`w-3 h-3 text-faint transition-transform ${showGroupPicker ? "rotate-90" : ""}`}
                  fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={1.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 2l4 4-4 4" />
                </svg>
              </DropdownMenuItem>

              {showGroupPicker && (
                <div className="border-t border-stroke-subtle bg-surface-3 py-1">
                  {isGrouped && (
                    <DropdownMenuItem
                      onClick={() => { onMoveToGroup(null); setShowGroupPicker(false); }}
                      className="pl-5 text-xs py-1.5 text-muted"
                    >
                      Ungrouped
                    </DropdownMenuItem>
                  )}
                  {groups.map((g) => (
                    <DropdownMenuItem
                      key={g.id}
                      onClick={() => { onMoveToGroup(g.id); setShowGroupPicker(false); }}
                      className={`pl-5 text-xs py-1.5 flex items-center gap-2 ${
                        g.id === currentGroupId ? "text-white font-medium" : "text-muted"
                      }`}
                    >
                      {g.color && (
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                      )}
                      <span className="truncate">{g.name}</span>
                      {g.id === currentGroupId && <span className="ml-auto pl-2 text-accent-fg">✓</span>}
                    </DropdownMenuItem>
                  ))}
                </div>
              )}
            </div>
          )}

          <DropdownMenuItem onClick={onSystemTerminal} disabled={openingTerminal}>
            {openingTerminal ? "Opening…" : "Open in Terminal"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onBrowseFiles} disabled={openingBrowser}>
            {openingBrowser ? "Connecting…" : "Browse Files"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDuplicate} disabled={duplicating}>
            {duplicating ? "Duplicating…" : "Duplicate"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onCheckReachability} disabled={checkingReachability}>
            {checkingReachability ? "Checking…" : "Check Connectivity"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDelete} disabled={deleting} className="text-red-400 data-highlighted:text-red-400">
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
