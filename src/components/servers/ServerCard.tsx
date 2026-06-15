import type { Server } from "../../types/server";
import { useServerActions, formatHost } from "./useServerActions";
import { useUiStore } from "../../store/uiStore";
import { useServerStore } from "../../store/serverStore";
import { useTunnelStore } from "../../store/tunnelStore";
import ServerKebabMenu from "./ServerKebabMenu";
import ConfirmDeleteModal from "../shared/ConfirmDeleteModal";
import ConnectionErrorModal from "./ConnectionErrorModal";
import { FavouriteButton } from "./FavouriteButton";
import { ReachabilityDot } from "./ReachabilityDot";
import { timeAgo } from "../../lib/format";

interface ServerCardProps {
  server: Server;
  groupColor?: string;
  lastConnected?: string;
}

export default function ServerCard({ server, groupColor, lastConnected }: ServerCardProps) {
  const actions = useServerActions(server);
  const jumpHost = useServerStore((s) =>
    server.jumpHostId ? s.servers.find((sv) => sv.id === server.jumpHostId) : undefined
  );
  const sid = server.id;
  const hasActiveTunnel = useTunnelStore((s) =>
    s.forwards.some((f) => f.serverId === sid && s.statuses[f.id] === "active")
  );
  const bulkMode = useUiStore((s) => s.bulkMode);
  const isSelected = useUiStore((s) => s.bulkSelected.includes(server.id));
  const toggleSelected = useUiStore((s) => s.toggleSelected);

  const handleClick = () => {
    if (bulkMode) { toggleSelected(server.id); return; }
    void actions.handleConnect();
  };

  return (
    <>
    <div
      onClick={handleClick}
      style={groupColor && !isSelected ? { backgroundColor: `${groupColor}18` } : undefined}
      className={`bg-surface-1 border rounded-lg p-3 flex flex-col gap-3 select-none shadow-card
        transition-[background-color,border-color,box-shadow,transform] duration-200 ease-premium
        ${isSelected ? "border-accent/50 bg-accent/5" : "border-stroke-subtle"}
        ${actions.connecting ? "opacity-60 cursor-wait" : "hover:border-stroke cursor-pointer hover:bg-surface-2 hover:shadow-card-hover hover:-translate-y-0.5"}`}
    >
      <div className="flex items-start gap-2">
        {bulkMode ? (
          <div className={`w-4 h-4 rounded border mt-0.5 shrink-0 flex items-center justify-center transition-colors ${
            isSelected ? "bg-accent border-accent" : "border-stroke"
          }`}>
            {isSelected && (
              <svg className="w-2.5 h-2.5 text-black" fill="none" viewBox="0 0 10 10" stroke="currentColor" strokeWidth={2}>
                <polyline points="1.5,5 4,7.5 8.5,2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
        ) : (
          <div
            className={`w-2 h-2 rounded-full mt-1 shrink-0 ${actions.connecting ? "bg-yellow-500 animate-pulse" : ""}`}
            style={!actions.connecting ? { backgroundColor: groupColor ?? "var(--color-dim)" } : undefined}
          />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <span className="font-medium text-white truncate" title={server.displayName}>{server.displayName}</span>
            {server.isJumpHost && (
              <span className="text-xs bg-surface-3 border border-stroke text-faint px-1.5 py-0.5 rounded font-medium">Jump</span>
            )}
            <ReachabilityDot serverId={server.id} />
          </div>
          <p className="text-sm text-muted font-mono truncate">{formatHost(server)}</p>
          <div className="flex items-center gap-1.5 mt-1">
            {server.authMethod === "password" ? (
              <svg className="w-3.5 h-3.5 text-muted" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5}><title>Password auth</title>
                <rect x="3" y="7" width="10" height="8" rx="1.5" />
                <path strokeLinecap="round" d="M5 7V5a3 3 0 016 0v2" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5 text-muted" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5}><title>Key auth</title>
                <circle cx="6" cy="8" r="3.5" />
                <path strokeLinecap="round" d="M9 8h5M12 6v4" />
              </svg>
            )}
            {lastConnected && (
              <span className="text-meta text-dim" title={new Date(lastConnected).toLocaleString()}>
                {timeAgo(lastConnected)}
              </span>
            )}
            {jumpHost && (
              <span className="text-meta text-dim flex items-center gap-0.5 min-w-0" title={`Routes via ${jumpHost.displayName}`}>
                <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2 8h9M8 5l3 3-3 3" />
                  <circle cx="13" cy="8" r="1.5" fill="currentColor" stroke="none" />
                </svg>
                <span className="truncate">{jumpHost.displayName}</span>
              </span>
            )}
            {hasActiveTunnel && (
              <span className="text-xs text-success flex items-center gap-0.5 shrink-0" title="Tunnel active">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 8h4M10 8h4M6 5l-2 3 2 3M10 5l2 3-2 3" />
                </svg>
              </span>
            )}
          </div>
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
            canCopyPassword={actions.canCopyPassword}
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
              className="text-xs bg-surface-3 border border-stroke text-muted px-1.5 py-0.5 rounded"
            >
              #{tag.name}
            </span>
          ))}
        </div>
      )}

      {actions.error && <p className="text-xs text-error">{actions.error}</p>}
    </div>

    {actions.deleteModalOpen && (
      <ConfirmDeleteModal
        title="Delete server?"
        description={<><span className="text-white font-medium">{server.displayName}</span> will be permanently removed. This cannot be undone.</>}
        busy={actions.deleting}
        onConfirm={() => { void actions.commitDelete(); }}
        onCancel={() => actions.setDeleteModalOpen(false)}
      />
    )}
    {actions.connectionError !== null && (
      <ConnectionErrorModal
        serverName={server.displayName}
        message={actions.connectionError || undefined}
        onRetry={() => { actions.setConnectionError(null); void actions.handleConnect(); }}
        onEdit={() => { actions.setConnectionError(null); actions.editServer(); }}
        onClose={() => actions.setConnectionError(null)}
      />
    )}
    </>
  );
}
