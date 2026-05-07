import type { Server } from "../../types/server";
import { useServerActions, formatHost } from "./useServerActions";
import ServerKebabMenu from "./ServerKebabMenu";

export default function ServerRow({ server }: { server: Server }) {
  const actions = useServerActions(server);

  return (
    <div
      onClick={() => { void actions.handleConnect(); }}
      title={server.notes ?? undefined}
      className={`group flex items-center gap-3 px-3 py-2.5 border-b border-[#1a1a1a] last:border-b-0 first:rounded-t-lg last:rounded-b-lg select-none transition-colors
        ${actions.connecting ? "opacity-60 cursor-wait bg-[#0d0d0d]" : "cursor-pointer hover:bg-[#0f0f0f]"}`}
    >
      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${actions.connecting ? "bg-accent animate-pulse" : "bg-[#333]"}`} />

      <span className="w-40 shrink-0 truncate text-sm font-medium text-white">
        {server.displayName}
      </span>

      <span className="flex-1 min-w-0 truncate text-sm text-[#666] font-mono">
        {formatHost(server)}
      </span>

      <div className="hidden md:flex items-center gap-1 shrink-0">
        {server.isJumpHost && (
          <span className="text-xs bg-accent/10 text-accent px-1.5 py-0.5 rounded">Jump</span>
        )}
        {server.tags.slice(0, 3).map((tag) => (
          <span
            key={tag.id}
            className="text-xs bg-[#1a1a1a] border border-[#2a2a2a] text-[#666] px-1.5 py-0.5 rounded"
          >
            #{tag.name}
          </span>
        ))}
        {server.tags.length > 3 && (
          <span className="text-xs text-[#444]">+{server.tags.length - 3}</span>
        )}
      </div>

      {actions.error && <span className="text-xs text-red-400 shrink-0 max-w-[160px] truncate">{actions.error}</span>}

      <ServerKebabMenu
        menuRef={actions.menuRef}
        menuOpen={actions.menuOpen}
        setMenuOpen={actions.setMenuOpen}
        confirmDelete={actions.confirmDelete}
        setConfirmDelete={actions.setConfirmDelete}
        deleting={actions.deleting}
        openingTerminal={actions.openingTerminal}
        onEdit={actions.editServer}
        onSystemTerminal={() => { void actions.handleSystemTerminal(); }}
        onDelete={() => { void actions.handleDelete(); }}
        buttonClassName="text-[#444] hover:text-white p-1 rounded hover:bg-[#1a1a1a] transition-colors text-base leading-none opacity-0 group-hover:opacity-100"
      />
    </div>
  );
}
