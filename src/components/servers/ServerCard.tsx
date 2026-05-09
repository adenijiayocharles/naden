import type { Server } from "../../types/server";
import { useServerActions, formatHost } from "./useServerActions";
import { useUiStore } from "../../store/uiStore";
import { useServerStore } from "../../store/serverStore";
import ServerKebabMenu from "./ServerKebabMenu";
import DeleteServerModal from "./DeleteServerModal";

export function FavouriteButton({ isFavourite, onToggle }: { isFavourite: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      aria-label={isFavourite ? "Remove from favourites" : "Add to favourites"}
      className={`p-0.5 rounded transition-colors shrink-0 ${
        isFavourite
          ? "text-yellow-400 hover:text-yellow-300"
          : "text-[#333] hover:text-[#888]"
      }`}
    >
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}
        fill={isFavourite ? "currentColor" : "none"}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
      </svg>
    </button>
  );
}

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

export default function ServerCard({ server }: { server: Server }) {
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
      className={`bg-[#111] border rounded-lg p-4 flex flex-col gap-3 transition-colors select-none
        ${isSelected ? "border-accent/50 bg-accent/5" : "border-[#1e1e1e]"}
        ${actions.connecting ? "opacity-60 cursor-wait" : "hover:border-[#2a2a2a] cursor-pointer hover:bg-[#131313]"}`}
    >
      <div className="flex items-start gap-2">
        {bulkMode ? (
          <div className={`w-4 h-4 rounded border mt-0.5 shrink-0 flex items-center justify-center transition-colors ${
            isSelected ? "bg-accent border-accent" : "border-[#444]"
          }`}>
            {isSelected && (
              <svg className="w-2.5 h-2.5 text-black" fill="none" viewBox="0 0 10 10" stroke="currentColor" strokeWidth={2}>
                <polyline points="1.5,5 4,7.5 8.5,2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
        ) : (
          <div className={`w-2 h-2 rounded-full mt-1 shrink-0 ${actions.connecting ? "bg-accent animate-pulse" : "bg-[#333]"}`} />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <span className="font-medium text-white truncate">{server.displayName}</span>
            {server.isJumpHost && (
              <span className="text-xs bg-accent/10 text-accent px-1.5 py-0.5 rounded font-medium">Jump</span>
            )}
            <ReachabilityDot serverId={server.id} />
          </div>
          <p className="text-sm text-[#888] font-mono truncate">{formatHost(server)}</p>
        </div>

        {!bulkMode && (
          <FavouriteButton
            isFavourite={server.isFavourite}
            onToggle={() => { void actions.handleToggleFavourite(); }}
          />
        )}

        {!bulkMode && (
          <ServerKebabMenu
            menuRef={actions.menuRef}
            menuOpen={actions.menuOpen}
            setMenuOpen={actions.setMenuOpen}
            isFavourite={server.isFavourite}
            canCopyPassword={actions.canCopyPassword}
            groups={actions.groups}
            currentGroupId={server.groupId}
            deleting={actions.deleting}
            openingTerminal={actions.openingTerminal}
            openingBrowser={actions.openingBrowser}
            duplicating={actions.duplicating}
            checkingReachability={actions.checkingReachability}
            onEdit={actions.editServer}
            onCopyPassword={() => { void actions.handleCopyPassword(); }}
            onSystemTerminal={() => { void actions.handleSystemTerminal(); }}
            onBrowseFiles={() => { void actions.handleBrowseFiles(); }}
            onToggleFavourite={() => { void actions.handleToggleFavourite(); }}
            onMoveToGroup={(gid) => { void actions.handleMoveToGroup(gid); }}
            onDuplicate={() => { void actions.handleDuplicate(); }}
            onCheckReachability={() => { void actions.handleCheckReachability(); }}
            onDelete={actions.handleDelete}
          />
        )}
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
