import type { Server } from "../../types/server";
import { useServerActions, formatHost } from "./useServerActions";
import { useUiStore } from "../../store/uiStore";
import { useServerStore } from "../../store/serverStore";
import ServerKebabMenu from "./ServerKebabMenu";
import DeleteServerModal from "./DeleteServerModal";

function ReachabilityDot({ serverId }: { serverId: string }) {
  const info = useServerStore((s) => s.reachability[serverId]);
  if (!info) return null;
  if (info.checking) {
    return <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse shrink-0" title="Checking…" />;
  }
  return (
    <span
      className={`w-1.5 h-1.5 rounded-full shrink-0 ${info.reachable ? "bg-[#CDFF00]" : "bg-red-500"}`}
      title={info.reachable ? `Reachable${info.latencyMs != null ? ` (${info.latencyMs}ms)` : ""}` : "Unreachable"}
    />
  );
}

export default function ServerRow({ server }: { server: Server }) {
  const actions = useServerActions(server);
  const bulkMode = useUiStore((s) => s.bulkMode);
  const bulkSelected = useUiStore((s) => s.bulkSelected);
  const toggleSelected = useUiStore((s) => s.toggleSelected);
  const isSelected = bulkSelected.includes(server.id);

  const handleClick = () => {
    if (bulkMode) { toggleSelected(server.id); return; }
    void actions.handleConnect();
  };

  return (
    <>
    <div
      onClick={handleClick}
      title={server.notes ?? undefined}
      className={`group flex items-center gap-3 px-3 py-2.5 border-b border-[#1a1a1a] last:border-b-0 first:rounded-t-lg last:rounded-b-lg select-none transition-colors
        ${isSelected ? "bg-accent/5" : ""}
        ${actions.connecting ? "opacity-60 cursor-wait bg-[#0d0d0d]" : "cursor-pointer hover:bg-[#0f0f0f]"}`}
    >
      {bulkMode ? (
        <div className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-colors ${
          isSelected ? "bg-accent border-accent" : "border-[#444]"
        }`}>
          {isSelected && (
            <svg className="w-2.5 h-2.5 text-black" fill="none" viewBox="0 0 10 10" stroke="currentColor" strokeWidth={2}>
              <polyline points="1.5,5 4,7.5 8.5,2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      ) : (
        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${actions.connecting ? "bg-accent animate-pulse" : "bg-[#333]"}`} />
      )}

      <span className="w-40 shrink-0 truncate text-sm font-medium text-white">
        {server.displayName}
      </span>

      <span className="flex-1 min-w-0 truncate text-sm text-[#666] font-mono">
        {formatHost(server)}
      </span>

      <div className="hidden md:flex items-center gap-1.5 shrink-0">
        <ReachabilityDot serverId={server.id} />
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

      {!bulkMode && (
        <ServerKebabMenu
          menuRef={actions.menuRef}
          menuOpen={actions.menuOpen}
          setMenuOpen={actions.setMenuOpen}
          isFavourite={server.isFavourite}
          deleting={actions.deleting}
          openingTerminal={actions.openingTerminal}
          openingBrowser={actions.openingBrowser}
          duplicating={actions.duplicating}
          checkingReachability={actions.checkingReachability}
          onEdit={actions.editServer}
          onSystemTerminal={() => { void actions.handleSystemTerminal(); }}
          onBrowseFiles={() => { void actions.handleBrowseFiles(); }}
          onToggleFavourite={() => { void actions.handleToggleFavourite(); }}
          onDuplicate={() => { void actions.handleDuplicate(); }}
          onCheckReachability={() => { void actions.handleCheckReachability(); }}
          onDelete={actions.handleDelete}
          buttonClassName="text-[#444] hover:text-white p-1 rounded hover:bg-[#1a1a1a] transition-colors text-base leading-none opacity-0 group-hover:opacity-100"
        />
      )}
    </div>

    {actions.deleteModalOpen && (
      <DeleteServerModal
        serverName={server.displayName}
        deleting={actions.deleting}
        onConfirm={() => { void actions.commitDelete(); }}
        onCancel={() => actions.setDeleteModalOpen(false)}
      />
    )}
    </>
  );
}
