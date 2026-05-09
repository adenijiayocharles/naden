import type { Server } from "../../types/server";
import { useServerActions, formatHost } from "./useServerActions";
import ServerKebabMenu from "./ServerKebabMenu";

export default function ServerCard({ server }: { server: Server }) {
  const actions = useServerActions(server);

  return (
    <div
      onClick={() => { void actions.handleConnect(); }}
      className={`bg-[#111] border border-[#1e1e1e] rounded-lg p-4 flex flex-col gap-3 transition-colors select-none
        ${actions.connecting ? "opacity-60 cursor-wait" : "hover:border-[#2a2a2a] cursor-pointer hover:bg-[#131313]"}`}
    >
      <div className="flex items-start gap-2">
        <div className={`w-2 h-2 rounded-full mt-1 shrink-0 ${actions.connecting ? "bg-accent animate-pulse" : "bg-[#333]"}`} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <span className="font-medium text-white truncate">{server.displayName}</span>
            {server.isJumpHost && (
              <span className="text-xs bg-accent/10 text-accent px-1.5 py-0.5 rounded font-medium">Jump</span>
            )}
          </div>
          <p className="text-sm text-[#888] font-mono truncate">{formatHost(server)}</p>
        </div>

        <ServerKebabMenu
          menuRef={actions.menuRef}
          menuOpen={actions.menuOpen}
          setMenuOpen={actions.setMenuOpen}
          confirmDelete={actions.confirmDelete}
          setConfirmDelete={actions.setConfirmDelete}
          deleting={actions.deleting}
          openingTerminal={actions.openingTerminal}
          openingBrowser={actions.openingBrowser}
          onEdit={actions.editServer}
          onSystemTerminal={() => { void actions.handleSystemTerminal(); }}
          onBrowseFiles={() => { void actions.handleBrowseFiles(); }}
          onDelete={() => { void actions.handleDelete(); }}
        />
      </div>

      {server.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {server.tags.map((tag) => (
            <span
              key={tag.id}
              className="text-xs bg-[#1a1a1a] border border-[#2a2a2a] text-[#999] px-1.5 py-0.5 rounded"
            >
              #{tag.name}
            </span>
          ))}
        </div>
      )}

      {server.notes && <p className="text-xs text-[#555] truncate">{server.notes}</p>}
      {actions.error && <p className="text-xs text-red-400">{actions.error}</p>}
    </div>
  );
}
