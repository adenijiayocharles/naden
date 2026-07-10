import { useState, useRef, useEffect } from "react";
import { Button } from "../ui/button";

export interface MenuAction { label: string; danger?: boolean; onClick: () => void }

export default function NavRow({
  active,
  onClick,
  label,
  count,
  menuActions,
}: {
  active: boolean;
  onClick: () => void;
  label: React.ReactNode;
  count?: number;
  menuActions?: MenuAction[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const hasMenu = menuActions && menuActions.length > 0;

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const activeBtn = active ? "bg-accent text-black font-medium" : "text-secondary hover:bg-surface-3 hover:text-white";
  const activeMenu = active ? "text-black/50 hover:text-black" : "text-dim hover:text-secondary hover:bg-surface-3";

  return (
    <div className="relative group/row flex items-center">
      <button
        onClick={onClick}
        className={`flex-1 min-w-0 text-left px-3 py-2 text-sm flex items-center justify-between transition-colors ${
          hasMenu ? "rounded-l" : "rounded"
        } ${activeBtn}`}
      >
        <span className="truncate">{label}</span>
        {count !== undefined && (
          <span className={`text-xs ml-2 shrink-0 ${active ? "text-black/60" : "text-muted"}`}>{count}</span>
        )}
      </button>

      {hasMenu && (
        <div ref={menuRef} className="relative">
          <Button
            variant="ghost"
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
            className={`h-full px-1.5 py-2 rounded-l-none transition-opacity ${
              menuOpen ? "opacity-100" : "opacity-0 group-hover/row:opacity-100"
            } ${activeMenu}`}
            aria-label="More options"
          >
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 16 16">
              <circle cx="8" cy="3" r="1.3" />
              <circle cx="8" cy="8" r="1.3" />
              <circle cx="8" cy="13" r="1.3" />
            </svg>
          </Button>

          {menuOpen && (
            <div className="absolute right-0 top-8 bg-surface-2 border border-stroke rounded-lg shadow-overlay z-30 min-w-[130px] py-1">
              {menuActions!.map((action) => (
                <button
                  key={action.label}
                  onClick={() => { action.onClick(); setMenuOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-surface-4 ${
                    action.danger ? "text-red-400 hover:text-red-300" : "text-secondary hover:text-white"
                  }`}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
