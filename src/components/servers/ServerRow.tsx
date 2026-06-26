import type React from "react";
import type { Server } from "../../types/server";
import { useServerActions, formatHost } from "./useServerActions";
import { useUiStore } from "../../store/uiStore";
import ServerKebabMenu from "./ServerKebabMenu";
import ConfirmDeleteModal from "../shared/ConfirmDeleteModal";
import ConnectionErrorModal from "./ConnectionErrorModal";
import { FavouriteButton } from "./FavouriteButton";
import { ReachabilityDot } from "./ReachabilityDot";
import { timeAgo } from "../../lib/format";
import { useHealthStore } from "../../store/healthStore";
import { HealthStatsInline } from "./HealthStats";

interface ServerRowProps {
  server: Server;
  groupColor?: string;
  lastConnected?: string;
  narrow?: boolean;
  isHighlighted?: boolean;
  jumpHost?: Server;
  hasActiveTunnel?: boolean;
  dragHandle?: React.ReactNode;
}

export default function ServerRow({ server, groupColor, lastConnected, narrow, isHighlighted, jumpHost, hasActiveTunnel, dragHandle }: ServerRowProps) {
  const actions = useServerActions(server);
  const bulkMode = useUiStore((s) => s.bulkMode);
  const isSelected = useUiStore((s) => s.bulkSelected.includes(server.id));
  const toggleSelected = useUiStore((s) => s.toggleSelected);
  const health = useHealthStore((s) => s.health[server.id]);

  const handleClick = () => {
    if (bulkMode) { toggleSelected(server.id); return; }
    void actions.handleConnect();
  };

  return (
    <>
    <div
      onClick={handleClick}
      style={groupColor && !isSelected ? { backgroundColor: `${groupColor}18` } : undefined}
      className={`group flex items-center gap-3 px-3 py-2.5 border-b border-stroke-subtle last:border-b-0 first:rounded-t-lg last:rounded-b-lg select-none transition-colors
        ${isSelected || isHighlighted ? "bg-accent/5" : ""}
        ${isHighlighted && !isSelected ? "border-l-2 border-l-accent/60" : ""}
        ${actions.connecting ? "opacity-60 cursor-wait bg-surface-0" : "cursor-pointer hover:bg-surface-0"}`}
    >
      {!bulkMode && dragHandle}

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
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${actions.connecting ? "bg-yellow-500 animate-pulse" : ""}`}
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
            <svg className="w-3.5 h-3.5 text-muted shrink-0" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5}><title>Password auth</title>
              <rect x="3" y="7" width="10" height="8" rx="1.5" />
              <path strokeLinecap="round" d="M5 7V5a3 3 0 016 0v2" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5 text-muted shrink-0" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5}><title>Key auth</title>
              <circle cx="6" cy="8" r="3.5" />
              <path strokeLinecap="round" d="M9 8h5M12 6v4" />
            </svg>
          )}

          <div className="hidden md:flex items-center gap-1.5 shrink-0">
            {health && <HealthStatsInline cpu={health.cpuPercent} mem={health.memPercent} disk={health.diskPercent} />}
            {!bulkMode && (
              <FavouriteButton
                isFavourite={server.isFavourite}
                onToggle={() => { void actions.handleToggleFavourite(); }}
              />
            )}
            <ReachabilityDot serverId={server.id} />
            {lastConnected && (
              <span
                className="text-meta text-dim font-mono hidden lg:block"
                title={new Date(lastConnected).toLocaleString()}
              >
                {timeAgo(lastConnected)}
              </span>
            )}
            {server.isJumpHost && (
              <span className="text-xs bg-surface-3 border border-stroke text-faint px-1.5 py-0.5 rounded">Jump</span>
            )}
            {jumpHost && (
              <span className="text-meta text-dim flex items-center gap-0.5 min-w-0 max-w-[120px]" title={`Routes via ${jumpHost.displayName}`}>
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
            {server.tags.slice(0, 3).map((tag) => (
              <span
                key={tag.id}
                className="text-xs bg-surface-3 border border-stroke text-faint px-1.5 py-0.5 rounded"
              >
                #{tag.name}
              </span>
            ))}
            {server.tags.length > 3 && (
              <span className="text-meta text-dim">+{server.tags.length - 3}</span>
            )}
          </div>
        </>
      )}

      {actions.error && <span className="text-xs text-error shrink-0 max-w-[160px] truncate">{actions.error}</span>}

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
