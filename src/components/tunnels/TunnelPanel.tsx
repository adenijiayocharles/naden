import { memo, useEffect, useMemo, useState } from "react";
import { useTunnelStore } from "../../store/tunnelStore";
import { useServerStore } from "../../store/serverStore";
import { formatError } from "../../lib/errors";
import type { ForwardType, PortForward, TunnelStatus } from "../../types/portForward";
import Input from "../shared/Input";
import Button from "../shared/Button";
import EmptyState from "../shared/EmptyState";
import DeleteTunnelModal from "./DeleteTunnelModal";

const STATUS_DOT: Record<TunnelStatus, string> = {
  active:     "bg-accent",
  connecting: "bg-yellow-500",
  error:      "bg-red-500",
  idle:       "bg-dim",
};

const STATUS_LABEL: Record<TunnelStatus, string> = {
  active:     "Active",
  connecting: "Connecting…",
  error:      "Error",
  idle:       "Idle",
};

const TYPE_BADGE: Record<ForwardType, string> = {
  local:   "border-blue-900 bg-blue-950/60 text-blue-300",
  dynamic: "border-purple-900 bg-purple-950/60 text-purple-300",
  remote:  "border-orange-900 bg-orange-950/60 text-orange-300",
};

const FORWARD_TYPES: { value: ForwardType; label: string; hint: string }[] = [
  { value: "local",   label: "Local",   hint: "localhost:localPort → remoteHost:remotePort" },
  { value: "dynamic", label: "Dynamic", hint: "SOCKS5 proxy on localhost:localPort" },
  { value: "remote",  label: "Remote",  hint: "serverPort → localhost:localPort" },
];

interface FwdFormState {
  serverId: string;
  label: string;
  forwardType: ForwardType;
  localPort: string;
  remoteHost: string;
  remotePort: string;
  autoStart: boolean;
}

const BLANK_FWD: FwdFormState = {
  serverId: "",
  label: "",
  forwardType: "local",
  localPort: "",
  remoteHost: "",
  remotePort: "",
  autoStart: false,
};

// ── Add tunnel modal ──────────────────────────────────────────────────────────

function AddTunnelModal({ onClose }: { onClose: () => void }) {
  const servers = useServerStore((s) => s.servers);
  const create = useTunnelStore((s) => s.create);

  const [form, setForm] = useState<FwdFormState>({ ...BLANK_FWD, serverId: servers[0]?.id ?? "" });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const setF = (field: keyof FwdFormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value = e.target.type === "checkbox"
        ? (e.target as HTMLInputElement).checked
        : e.target.value;
      setForm((f) => ({ ...f, [field]: value }));
      setFormError(null);
    };

  const validate = (): string | null => {
    if (!form.serverId) return "Select a server";
    const lp = Number(form.localPort);
    if (!form.localPort || isNaN(lp) || lp < 1 || lp > 65535)
      return "Local port must be 1–65535";
    if (form.forwardType !== "dynamic") {
      if (!form.remoteHost.trim()) return "Remote host is required";
      const rp = Number(form.remotePort);
      if (!form.remotePort || isNaN(rp) || rp < 1 || rp > 65535)
        return "Remote port must be 1–65535";
    }
    return null;
  };

  const handleSave = async () => {
    const err = validate();
    if (err) { setFormError(err); return; }
    setSaving(true);
    setFormError(null);
    try {
      await create({
        serverId: form.serverId,
        label: form.label.trim(),
        forwardType: form.forwardType,
        localPort: Number(form.localPort),
        remoteHost: form.forwardType === "dynamic" ? "" : form.remoteHost.trim(),
        remotePort: form.forwardType === "dynamic" ? 0 : Number(form.remotePort),
        autoStart: form.autoStart,
      });
      onClose();
    } catch (e) {
      setFormError(formatError(e));
    } finally {
      setSaving(false);
    }
  };

  const isDynamic = form.forwardType === "dynamic";

  return (
    <div
      className="fixed inset-0 bg-black/85 animate-backdrop-in flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface-2 border border-stroke rounded-xl shadow-overlay animate-overlay-in w-full max-w-md flex flex-col">
        <div className="px-5 py-4 border-b border-stroke-subtle flex items-center justify-between">
          <h2 className="text-white font-semibold text-base">Add port forward</h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-secondary mb-1">Server</label>
            <select
              value={form.serverId}
              onChange={setF("serverId")}
              className="w-full h-9 px-2.5 rounded-md bg-surface-3 border border-stroke text-sm text-white focus:outline-none focus:border-accent"
            >
              {servers.map((s) => (
                <option key={s.id} value={s.id}>{s.displayName}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-secondary mb-1.5">Type</label>
            <div className="flex h-9 rounded border border-stroke overflow-hidden">
              {FORWARD_TYPES.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, forwardType: value }))}
                  className={`flex-1 h-full text-sm transition-colors ${
                    form.forwardType === value
                      ? "bg-accent text-black font-semibold"
                      : "bg-surface-3 text-muted hover:text-white hover:bg-surface-4"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-meta text-faint">
              {FORWARD_TYPES.find((t) => t.value === form.forwardType)?.hint}
            </p>
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs text-secondary mb-1">Local port</label>
              <Input
                type="number"
                value={form.localPort}
                onChange={setF("localPort")}
                placeholder="e.g. 5432"
                min={1}
                max={65535}
              />
            </div>
            {!isDynamic && (
              <>
                <div className="flex-[2]">
                  <label className="block text-xs text-secondary mb-1">Remote host</label>
                  <Input
                    value={form.remoteHost}
                    onChange={setF("remoteHost")}
                    placeholder="db.internal"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-secondary mb-1">Remote port</label>
                  <Input
                    type="number"
                    value={form.remotePort}
                    onChange={setF("remotePort")}
                    placeholder="5432"
                    min={1}
                    max={65535}
                  />
                </div>
              </>
            )}
          </div>

          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="block text-xs text-secondary mb-1">Label (optional)</label>
              <Input
                value={form.label}
                onChange={setF("label")}
                placeholder="e.g. Postgres"
              />
            </div>
            <label className="flex items-center gap-1.5 pb-2.5 text-xs text-secondary cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={form.autoStart}
                onChange={setF("autoStart")}
                className="rounded border-stroke bg-surface-3 text-accent-fg"
              />
              Auto-start
            </label>
          </div>

          {formError && <p className="text-xs text-red-400">{formError}</p>}
        </div>

        <div className="px-5 py-4 border-t border-stroke-subtle flex gap-2 justify-end">
          <Button type="button" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            type="button"
            size="sm"
            variant="primary"
            onClick={() => { void handleSave(); }}
            disabled={saving}
          >
            {saving ? "Saving…" : "Add"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Per-row component ─────────────────────────────────────────────────────────

const TunnelRow = memo(function TunnelRow({
  fwd,
  onStart,
  onStop,
  onDelete,
}: {
  fwd: PortForward;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const status: TunnelStatus = useTunnelStore((s) => s.statuses[fwd.id] ?? "idle");
  const err = useTunnelStore((s) => s.errors[fwd.id]);
  const isRunning = status === "active" || status === "connecting";
  const isDynamic = fwd.forwardType === "dynamic";

  const dotClass = `w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[status]} ${isRunning ? "animate-pulse" : ""}`;

  return (
    <div className="group flex flex-col gap-1 px-3 py-2.5 border-b border-stroke-subtle last:border-b-0 first:rounded-t-lg last:rounded-b-lg select-none hover:bg-surface-1 transition-colors">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className={dotClass} title={STATUS_LABEL[status]} />
          <span className="text-sm font-mono text-white truncate">localhost:{fwd.localPort}</span>
        </div>

        <span className={`shrink-0 text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full border ${TYPE_BADGE[fwd.forwardType]}`}>
          {fwd.forwardType}
        </span>

        <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
          {!isDynamic && (
            <>
              <span className="text-sm font-mono text-white truncate text-right">{fwd.remoteHost}:{fwd.remotePort}</span>
              <span className={dotClass} title={STATUS_LABEL[status]} />
            </>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => isRunning ? onStop(fwd.id) : onStart(fwd.id)}
            disabled={status === "connecting"}
            title={isRunning ? "Stop tunnel" : "Start tunnel"}
            className={`p-1 rounded transition-colors disabled:opacity-40 ${
              isRunning
                ? "text-dim hover:text-red-400 hover:bg-surface-3"
                : "text-dim hover:text-accent hover:bg-surface-3"
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
          <button
            onClick={() => onDelete(fwd.id)}
            title="Delete"
            className="p-1 rounded text-dim hover:text-red-400 hover:bg-surface-3 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 4h10M6 4V2h4v2M5 4v9a1 1 0 001 1h4a1 1 0 001-1V4" />
            </svg>
          </button>
        </div>
      </div>

      {(fwd.label || (err && status === "error")) && (
        <div className="pl-[14px] flex items-center gap-2 text-xs">
          {fwd.label && <span className="text-faint">{fwd.label}</span>}
          {err && status === "error" && <span className="text-red-400">{formatError(err)}</span>}
        </div>
      )}
    </div>
  );
});

// ── Panel ─────────────────────────────────────────────────────────────────────

export default function TunnelPanel() {
  const servers = useServerStore((s) => s.servers);
  const forwards = useTunnelStore((s) => s.forwards);
  const startTunnel = useTunnelStore((s) => s.startTunnel);
  const stopTunnel = useTunnelStore((s) => s.stopTunnel);
  const remove = useTunnelStore((s) => s.remove);

  const [modalOpen, setModalOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<PortForward | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleStart = (id: string) => { void startTunnel(id).catch(() => {}); };
  const handleStop  = (id: string) => { void stopTunnel(id).catch(() => {}); };
  const handleDelete = (id: string) => {
    setDeleteTarget(forwards.find((fwd) => fwd.id === id) ?? null);
  };
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await remove(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      // remove() surfaces its own error via the store; keep the modal open so the user can retry.
    } finally {
      setDeleting(false);
    }
  };

  const filtered = useMemo(() => {
    if (!query.trim()) return forwards;
    const q = query.toLowerCase();
    return forwards.filter((fwd) => {
      const server = servers.find((s) => s.id === fwd.serverId);
      return (
        fwd.label.toLowerCase().includes(q) ||
        fwd.remoteHost.toLowerCase().includes(q) ||
        fwd.forwardType.includes(q) ||
        String(fwd.localPort).includes(q) ||
        String(fwd.remotePort).includes(q) ||
        server?.displayName.toLowerCase().includes(q)
      );
    });
  }, [forwards, servers, query]);

  // Group filtered forwards by server, preserving server display-name order.
  const groups = useMemo(() => {
    const map = new Map<string, typeof forwards>();
    for (const fwd of filtered) {
      if (!map.has(fwd.serverId)) map.set(fwd.serverId, []);
      map.get(fwd.serverId)!.push(fwd);
    }
    return Array.from(map.entries()).map(([serverId, fwds]) => ({
      server: servers.find((s) => s.id === serverId),
      serverId,
      fwds,
    }));
  }, [filtered, servers]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-4 h-14 border-b border-stroke-subtle shrink-0 flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search port forwards…"
            className="w-full h-10 bg-surface-3 border border-stroke rounded px-3 text-sm text-white placeholder-faint focus:outline-none focus:border-accent transition-colors"
          />
        </div>
        <Button
          variant="primary"
          onClick={() => setModalOpen(true)}
          disabled={servers.length === 0}
        >
          + New
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {forwards.length === 0 ? (
          <EmptyState
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            }
            heading="No port forwards"
            subline={
              servers.length === 0
                ? "Add a server first, then create a port forward."
                : "Forward ports over SSH to access remote services locally."
            }
            action={
              servers.length > 0
                ? { label: "+ New Port Forward", onClick: () => setModalOpen(true) }
                : undefined
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35M8.5 8.5l5 5M13.5 8.5l-5 5" />
              </svg>
            }
            heading="No matches"
            subline={`No port forwards match "${query}"`}
          />
        ) : (
          <div className="space-y-4">
            {groups.map(({ server, serverId, fwds }) => (
              <div key={serverId}>
                <p className="text-xs font-semibold text-faint uppercase tracking-wider mb-2 px-1">
                  {server?.displayName ?? serverId}
                </p>
                <div className="border border-stroke-subtle rounded-lg bg-surface-0">
                  {fwds.map((fwd) => (
                    <TunnelRow
                      key={fwd.id}
                      fwd={fwd}
                      onStart={handleStart}
                      onStop={handleStop}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modalOpen && <AddTunnelModal onClose={() => setModalOpen(false)} />}

      {deleteTarget && (
        <DeleteTunnelModal
          label={
            deleteTarget.label ||
            (deleteTarget.forwardType === "dynamic"
              ? `localhost:${deleteTarget.localPort}`
              : `localhost:${deleteTarget.localPort} → ${deleteTarget.remoteHost}:${deleteTarget.remotePort}`)
          }
          deleting={deleting}
          onConfirm={() => { void handleConfirmDelete(); }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
