import type { Server } from "../../types/server";
import { useServerActions, formatHost } from "./useServerActions";
import { useUiStore } from "../../store/uiStore";
import ServerKebabMenu from "./ServerKebabMenu";
import DeleteServerModal from "./DeleteServerModal";
import ConnectionErrorModal from "./ConnectionErrorModal";
import { FavouriteButton, ReachabilityDot } from "./ServerCard";
import { timeAgo } from "../../lib/format";

interface ServerRowProps {
  server: Server;
  groupColor?: string;
  lastConnected?: string;
  narrow?: boolean;
}

export default function ServerRow({ server, groupColor, lastConnected, narrow }: ServerRowProps) {
  const actions = useServerActions(server);
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
      className={`group flex items-center gap-3 px-3 py-2.5 border-b border-stroke-subtle last:border-b-0 first:rounded-t-lg last:rounded-b-lg select-none transition-colors
        ${isSelected ? "bg-accent/5" : ""}
        ${actions.connecting ? "opacity-60 cursor-wait bg-surface-0" : "cursor-pointer hover:bg-surface-0"}`}
    >
      {bulkMode ? (
        <div className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-colors ${
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
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${actions.connecting ? "bg-accent animate-pulse" : ""}`}
          style={!actions.connecting ? { backgroundColor: groupColor ?? "var(--color-dim)" } : undefined}
        />
      )}

      {narrow ? (
        <span className="flex-1 min-w-0 truncate text-sm font-medium text-white" title={server.displayName}>
          {server.displayName !== server.hostname ? server.displayName : server.hostname}
        </span>
      ) : (
        <>
          <span className="w-40 shrink-0 truncate text-sm font-medium text-white" title={server.displayName}>
            {server.displayName}
          </span>
          <span className="flex-1 min-w-0 truncate text-sm text-faint font-mono">
            {formatHost(server)}
          </span>
        </>
      )}

      {!narrow && (
        <>
          {server.authMethod === "password" ? (
            <svg className="w-3.5 h-3.5 text-muted shrink-0" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.8}><title>Password auth</title>
              <rect x="3" y="7" width="10" height="8" rx="1.5" />
              <path strokeLinecap="round" d="M5 7V5a3 3 0 016 0v2" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5 text-muted shrink-0" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.8}><title>Key auth</title>
              <circle cx="6" cy="8" r="3.5" />
              <path strokeLinecap="round" d="M9 8h5M12 6v4" />
            </svg>
          )}

          <div className="hidden md:flex items-center gap-1.5 shrink-0">
            {!bulkMode && (
              <FavouriteButton
                isFavourite={server.isFavourite}
                onToggle={() => { void actions.handleToggleFavourite(); }}
              />
            )}
            <ReachabilityDot serverId={server.id} />
            {lastConnected && (
              <span
                className="text-xs text-dim font-mono hidden lg:block"
                title={new Date(lastConnected).toLocaleString()}
              >
                {timeAgo(lastConnected)}
              </span>
            )}
            {server.isJumpHost && (
              <span className="text-xs bg-accent/10 text-accent-fg px-1.5 py-0.5 rounded">Jump</span>
            )}
            {server.tags.slice(0, 3).map((tag) => (
              <span
                key={tag.id}
                className="text-xs bg-surface-3 border border-stroke text-faint px-1.5 py-0.5 rounded"
              >
                #{tag.name}
              </span>
            ))}
            {server.tags.length > 3 && (
              <span className="text-xs text-dim">+{server.tags.length - 3}</span>
            )}
          </div>
        </>
      )}

      {actions.error && <span className="text-xs text-red-400 shrink-0 max-w-[160px] truncate">{actions.error}</span>}

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
          buttonClassName="text-dim hover:text-white p-1 rounded hover:bg-surface-3 transition-colors transition-opacity duration-150 text-base leading-none opacity-0 group-hover:opacity-100"
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
    {actions.connectionError !== null && (
      <ConnectionErrorModal
        serverName={server.displayName}
        message={actions.connectionError || undefined}
        onRetry={() => { actions.setConnectionError(null); void actions.handleConnect(); }}
        onClose={() => actions.setConnectionError(null)}
      />
    )}
    </>
  );
}
