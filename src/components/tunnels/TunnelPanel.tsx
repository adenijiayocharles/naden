import { memo, useMemo } from "react";
import { useTunnelStore } from "../../store/tunnelStore";
import { useServerStore } from "../../store/serverStore";
import { formatError } from "../../lib/errors";
import type { PortForward, TunnelStatus } from "../../types/portForward";

const STATUS_DOT: Record<TunnelStatus, string> = {
  active:     "bg-accent",
  connecting: "bg-yellow-500 animate-pulse",
  error:      "bg-red-500",
  idle:       "bg-dim",
};

const STATUS_LABEL: Record<TunnelStatus, string> = {
  active:     "Active",
  connecting: "Connecting…",
  error:      "Error",
  idle:       "Idle",
};

// ── Per-row component ─────────────────────────────────────────────────────────
// Subscribes only to the status/error slices that change per tunnel event,
// so stable rows don't re-render when unrelated tunnels update.

const TunnelRow = memo(function TunnelRow({
  fwd,
  onStart,
  onStop,
}: {
  fwd: PortForward;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
}) {
  const status: TunnelStatus = useTunnelStore((s) => s.statuses[fwd.id] ?? "idle");
  const err = useTunnelStore((s) => s.errors[fwd.id]);
  const isRunning = status === "active" || status === "connecting";

  return (
    <div className="bg-surface-0 rounded-lg px-3 py-2.5">
      <div className="flex items-center gap-3">
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[status]}`}
          title={STATUS_LABEL[status]}
        />
        <div className="flex-1 min-w-0">
          <span className="text-xs font-mono text-white">
            {fwd.forwardType === "dynamic"
              ? `localhost:${fwd.localPort}`
              : `localhost:${fwd.localPort} → ${fwd.remoteHost}:${fwd.remotePort}`}
          </span>
          <span className={`ml-1.5 text-[10px] px-1 py-0.5 rounded font-medium ${
            fwd.forwardType === "local"   ? "bg-blue-950 text-blue-300" :
            fwd.forwardType === "dynamic" ? "bg-purple-950 text-purple-300" :
                                            "bg-orange-950 text-orange-300"
          }`}>
            {fwd.forwardType}
          </span>
          {fwd.label && <span className="ml-1.5 text-xs text-faint">{fwd.label}</span>}
        </div>
        <button
          onClick={() => isRunning ? onStop(fwd.id) : onStart(fwd.id)}
          disabled={status === "connecting"}
          title={isRunning ? "Stop tunnel" : "Start tunnel"}
          className={`shrink-0 w-7 h-7 flex items-center justify-center rounded transition-colors disabled:opacity-40 ${
            isRunning
              ? "text-muted hover:text-red-400 hover:bg-red-950"
              : "text-muted hover:text-accent hover:bg-accent/10"
          }`}
        >
          {isRunning ? (
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 14 14">
              <rect x="2" y="2" width="10" height="10" rx="1.5" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 14 14">
              <polygon points="3,2 11,7 3,12" />
            </svg>
          )}
        </button>
      </div>
      {err && status === "error" && (
        <p className="mt-1.5 text-xs text-red-400 pl-5">{formatError(err)}</p>
      )}
    </div>
  );
});

// ── Panel ─────────────────────────────────────────────────────────────────────

export default function TunnelPanel() {
  const servers = useServerStore((s) => s.servers);
  // Subscribe only to the stable forwards list; status updates go to TunnelRow.
  const forwards = useTunnelStore((s) => s.forwards);
  const startTunnel = useTunnelStore((s) => s.startTunnel);
  const stopTunnel = useTunnelStore((s) => s.stopTunnel);

  const handleStart = (id: string) => { void startTunnel(id).catch(() => {}); };
  const handleStop  = (id: string) => { void stopTunnel(id).catch(() => {}); };

  // Group forwards by server, preserving server display-name order.
  const groups = useMemo(() => {
    const map = new Map<string, typeof forwards>();
    for (const fwd of forwards) {
      if (!map.has(fwd.serverId)) map.set(fwd.serverId, []);
      map.get(fwd.serverId)!.push(fwd);
    }
    return Array.from(map.entries()).map(([serverId, fwds]) => ({
      server: servers.find((s) => s.id === serverId),
      serverId,
      fwds,
    }));
  }, [forwards, servers]);

  if (forwards.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-xs">
          <svg className="w-10 h-10 mx-auto mb-3 text-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
          <p className="text-sm text-muted mb-1">No port forwards configured</p>
          <p className="text-xs text-faint">Open a server's edit form to add port forwards.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-5">
      {groups.map(({ server, serverId, fwds }) => (
        <div key={serverId}>
          {/* Server heading */}
          <p className="text-xs font-semibold text-faint uppercase tracking-wider mb-2 px-1">
            {server?.displayName ?? serverId}
          </p>

          <div className="space-y-1">
            {fwds.map((fwd) => (
              <TunnelRow
                key={fwd.id}
                fwd={fwd}
                onStart={handleStart}
                onStop={handleStop}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
