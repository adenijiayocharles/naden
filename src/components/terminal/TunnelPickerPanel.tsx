import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTunnelStore } from "../../store/tunnelStore";
import { useTerminalToolsStore } from "../../store/terminalToolsStore";
import { formatError } from "../../lib/errors";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import type { ForwardType, PortForward, TunnelStatus } from "../../types/portForward";

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
  const createTunnel = useTunnelStore((s) => s.create);

  const [showAddTunnel, setShowAddTunnel] = useState(false);
  const [addFwdType, setAddFwdType] = useState<ForwardType>("local");
  const [addLocalPort, setAddLocalPort] = useState("");
  const [addRemoteHost, setAddRemoteHost] = useState("");
  const [addRemotePort, setAddRemotePort] = useState("");
  const [addTunnelError, setAddTunnelError] = useState<string | null>(null);
  const [addTunnelSaving, setAddTunnelSaving] = useState(false);

  const reset = useCallback(() => {
    setShowAddTunnel(false);
    setAddFwdType("local");
    setAddLocalPort("");
    setAddRemoteHost("");
    setAddRemotePort("");
    setAddTunnelError(null);
  }, []);

  const close = useCallback(() => {
    reset();
    closeTool();
  }, [reset, closeTool]);

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

  const handleAdd = useCallback(async () => {
    const lp = Number(addLocalPort);
    if (!addLocalPort || isNaN(lp) || lp < 1 || lp > 65535) {
      setAddTunnelError("Local port must be 1–65535");
      return;
    }
    if (addFwdType !== "dynamic") {
      if (!addRemoteHost.trim()) { setAddTunnelError("Remote host is required"); return; }
      const rp = Number(addRemotePort);
      if (!addRemotePort || isNaN(rp) || rp < 1 || rp > 65535) {
        setAddTunnelError("Remote port must be 1–65535");
        return;
      }
    }
    setAddTunnelSaving(true);
    setAddTunnelError(null);
    try {
      await createTunnel({
        serverId,
        label: "",
        forwardType: addFwdType,
        localPort: lp,
        remoteHost: addFwdType === "dynamic" ? "" : addRemoteHost.trim(),
        remotePort: addFwdType === "dynamic" ? 0 : Number(addRemotePort),
        autoStart: false,
      });
      reset();
    } catch (e) {
      setAddTunnelError(formatError(e));
    } finally {
      setAddTunnelSaving(false);
    }
  }, [addLocalPort, addFwdType, addRemoteHost, addRemotePort, serverId, createTunnel, reset]);

  return (
    <div
      ref={ref}
      className="absolute top-3 right-4 z-30 w-72 bg-surface-2 border border-stroke rounded-lg shadow-overlay overflow-hidden flex flex-col"
    >
      <div className="px-3 py-2 border-b border-stroke-subtle flex items-center justify-between shrink-0">
        <span className="text-xs font-semibold text-secondary uppercase tracking-wider">Port Forwards</span>
        {!showAddTunnel && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setShowAddTunnel(true)}
            title="Add port forward"
            className="text-faint hover:text-accent w-5 h-5"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
              <path d="M8 3v10M3 8h10" />
            </svg>
          </Button>
        )}
      </div>

      {serverForwards.length > 0 && (
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
      )}

      {serverForwards.length === 0 && !showAddTunnel && (
        <div className="px-3 py-4 text-center">
          <p className="text-sm text-dim mb-2">No port forwards configured</p>
          <Button variant="secondary" size="sm" onClick={() => setShowAddTunnel(true)}>
            + Add Forward
          </Button>
        </div>
      )}

      {showAddTunnel && (
        <div className="p-3 border-t border-stroke-subtle space-y-2.5">
          <div className="flex h-7 rounded border border-stroke overflow-hidden">
            {(["local", "dynamic", "remote"] as ForwardType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setAddFwdType(t); setAddTunnelError(null); }}
                className={`flex-1 h-full text-xs transition-colors ${
                  addFwdType === t
                    ? "bg-accent text-black font-semibold"
                    : "bg-surface-3 text-muted hover:text-white hover:bg-surface-4"
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          <div className="flex gap-1.5 items-end">
            <div className="w-16 shrink-0">
              <label className="block text-[10px] text-dim mb-0.5">Local port</label>
              <Input
                type="number"
                value={addLocalPort}
                onChange={(e) => { setAddLocalPort(e.target.value); setAddTunnelError(null); }}
                placeholder="5432"
                min={1}
                max={65535}
                className="h-7 text-xs px-2"
                autoFocus
              />
            </div>
            {addFwdType !== "dynamic" && (
              <>
                <div className="flex-1 min-w-0">
                  <label className="block text-[10px] text-dim mb-0.5">Remote host</label>
                  <Input
                    value={addRemoteHost}
                    onChange={(e) => { setAddRemoteHost(e.target.value); setAddTunnelError(null); }}
                    placeholder="db.internal"
                    className="h-7 text-xs px-2"
                  />
                </div>
                <div className="w-14 shrink-0">
                  <label className="block text-[10px] text-dim mb-0.5">Port</label>
                  <Input
                    type="number"
                    value={addRemotePort}
                    onChange={(e) => { setAddRemotePort(e.target.value); setAddTunnelError(null); }}
                    placeholder="5432"
                    min={1}
                    max={65535}
                    className="h-7 text-xs px-2"
                    onKeyDown={(e) => { if (e.key === "Enter") void handleAdd(); }}
                  />
                </div>
              </>
            )}
            {addFwdType === "dynamic" && (
              <Input
                value=""
                readOnly
                placeholder="SOCKS5 proxy"
                className="h-7 text-xs px-2 flex-1 text-dim"
                tabIndex={-1}
              />
            )}
          </div>

          {addTunnelError && <p className="text-[11px] text-error">{addTunnelError}</p>}

          <div className="flex gap-1.5">
            <Button variant="secondary" size="sm" onClick={reset} disabled={addTunnelSaving} className="flex-1">
              Cancel
            </Button>
            <Button size="sm" onClick={() => { void handleAdd(); }} disabled={addTunnelSaving} className="flex-1">
              {addTunnelSaving ? "Adding…" : "Add"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
