import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTunnelStore } from "../../store/tunnelStore";
import { useTerminalToolsStore } from "../../store/terminalToolsStore";
import { formatError } from "../../lib/errors";
import { Button } from "../ui/button";
import type { PortForward, TunnelStatus } from "../../types/portForward";

const STATUS_DOT: Record<TunnelStatus, string> = {
  active:     "bg-green-500",
  connecting: "bg-yellow-500 animate-pulse",
  error:      "bg-red-500",
  idle:       "bg-dim",
};

function TunnelPickerRow({
  fwd,
  status,
  error,
  onStart,
  onStop,
}: {
  fwd: PortForward;
  status: TunnelStatus;
  error: string | undefined;
  onStart: () => void;
  onStop: () => void;
}) {
  const isRunning = status === "active" || status === "connecting";
  const isDynamic = fwd.forwardType === "dynamic";

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-stroke-subtle last:border-b-0 hover:bg-surface-1 transition-colors group">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[status]}`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-mono text-white truncate">
          :{fwd.localPort}
          {!isDynamic && <span className="text-dim"> → {fwd.remoteHost}:{fwd.remotePort}</span>}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={`text-[10px] px-1 py-px rounded font-medium ${
            fwd.forwardType === "local"   ? "bg-blue-950 text-blue-300" :
            fwd.forwardType === "dynamic" ? "bg-purple-950 text-purple-300" :
                                            "bg-orange-950 text-orange-300"
          }`}>
            {fwd.forwardType}
          </span>
          {fwd.label && <span className="text-[10px] text-dim truncate">{fwd.label}</span>}
          {error && status === "error" && (
            <span className="text-[10px] text-error truncate">{formatError(error)}</span>
          )}
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={isRunning ? onStop : onStart}
        disabled={status === "connecting"}
        title={isRunning ? "Stop tunnel" : "Start tunnel"}
        className={`shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ${
          isRunning ? "text-dim hover:text-red-400" : "text-dim hover:text-accent"
        }`}
      >
        {isRunning ? (
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 14 14">
            <rect x="2" y="2" width="10" height="10" rx="1.5" />
          </svg>
        ) : (
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 14 14">
            <polygon points="3,2 11,7 3,12" />
          </svg>
        )}
      </Button>
    </div>
  );
}

interface Props {
  serverId: string;
}

export default function TunnelPickerPanel({ serverId }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const closeTool = useTerminalToolsStore((s) => s.closeTool);

  const allForwards = useTunnelStore((s) => s.forwards);
  const serverForwards = useMemo(
    () => allForwards.filter((f) => f.serverId === serverId),
    [allForwards, serverId],
  );
  const tunnelStatuses = useTunnelStore((s) => s.statuses);
  const tunnelErrors = useTunnelStore((s) => s.errors);
  const startTunnel = useTunnelStore((s) => s.startTunnel);
  const stopTunnel = useTunnelStore((s) => s.stopTunnel);

  const close = useCallback(() => { closeTool(); }, [closeTool]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!ref.current?.contains(target) && !target.closest("[data-terminal-tool-trigger]")) {
        close();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [close]);

  return (
    <div
      ref={ref}
      className="absolute top-3 right-4 z-30 w-72 bg-surface-2 border border-stroke rounded-lg shadow-overlay overflow-hidden flex flex-col"
    >
      <div className="px-3 py-2 border-b border-stroke-subtle shrink-0">
        <span className="text-xs font-semibold text-secondary uppercase tracking-wider">Port Forwards</span>
      </div>

      {serverForwards.length > 0 ? (
        <div className="overflow-y-auto max-h-52">
          {serverForwards.map((fwd) => (
            <TunnelPickerRow
              key={fwd.id}
              fwd={fwd}
              status={tunnelStatuses[fwd.id] ?? "idle"}
              error={tunnelErrors[fwd.id]}
              onStart={() => { void startTunnel(fwd.id).catch(() => {}); }}
              onStop={() => { void stopTunnel(fwd.id).catch(() => {}); }}
            />
          ))}
        </div>
      ) : (
        <div className="px-3 py-4 text-center">
          <p className="text-sm text-dim">No port forwards configured</p>
        </div>
      )}
    </div>
  );
}
