import { useState } from "react";
import { useTunnelStore } from "../../store/tunnelStore";
import { formatError } from "../../lib/errors";
import type { ForwardType, PortForward } from "../../types/portForward";
import Input from "../shared/Input";
import Button from "../shared/Button";
import ConfirmDeleteModal from "../shared/ConfirmDeleteModal";

const FORWARD_TYPES: { value: ForwardType; label: string; hint: string }[] = [
  { value: "local",   label: "Local",   hint: "localhost:localPort → remoteHost:remotePort" },
  { value: "dynamic", label: "Dynamic", hint: "SOCKS5 proxy on localhost:localPort" },
  { value: "remote",  label: "Remote",  hint: "serverPort → localhost:localPort" },
];

interface FwdFormState {
  label: string;
  forwardType: ForwardType;
  localPort: string;
  remoteHost: string;
  remotePort: string;
  autoStart: boolean;
}

const BLANK_FWD: FwdFormState = {
  label: "",
  forwardType: "local",
  localPort: "",
  remoteHost: "",
  remotePort: "",
  autoStart: false,
};

export default function PortForwardsSection({ serverId }: { serverId: string }) {
  const { forwards, create, update, remove } = useTunnelStore();
  const serverForwards = forwards.filter((f) => f.serverId === serverId);

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fwdForm, setFwdForm] = useState<FwdFormState>(BLANK_FWD);
  const [fwdError, setFwdError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const setF = (field: keyof FwdFormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value = e.target.type === "checkbox"
        ? (e.target as HTMLInputElement).checked
        : e.target.value;
      setFwdForm((f) => ({ ...f, [field]: value }));
      setFwdError(null);
    };

  const openAdd = () => {
    setFwdForm(BLANK_FWD);
    setFwdError(null);
    setEditingId(null);
    setAdding(true);
  };

  const openEdit = (fwd: PortForward) => {
    setFwdForm({
      label: fwd.label,
      forwardType: fwd.forwardType,
      localPort: String(fwd.localPort),
      remoteHost: fwd.remoteHost,
      remotePort: String(fwd.remotePort),
      autoStart: fwd.autoStart,
    });
    setFwdError(null);
    setEditingId(fwd.id);
    setAdding(true);
  };

  const cancelEdit = () => {
    setAdding(false);
    setEditingId(null);
    setFwdError(null);
  };

  const validateFwd = (): string | null => {
    const lp = Number(fwdForm.localPort);
    if (!fwdForm.localPort || isNaN(lp) || lp < 1 || lp > 65535)
      return "Local port must be 1–65535";
    if (fwdForm.forwardType !== "dynamic") {
      if (!fwdForm.remoteHost.trim()) return "Remote host is required";
      const rp = Number(fwdForm.remotePort);
      if (!fwdForm.remotePort || isNaN(rp) || rp < 1 || rp > 65535)
        return "Remote port must be 1–65535";
    }
    return null;
  };

  const handleSave = async () => {
    const err = validateFwd();
    if (err) { setFwdError(err); return; }
    setSaving(true);
    setFwdError(null);
    try {
      const payload = {
        label: fwdForm.label.trim(),
        forwardType: fwdForm.forwardType,
        localPort: Number(fwdForm.localPort),
        remoteHost: fwdForm.forwardType === "dynamic" ? "" : fwdForm.remoteHost.trim(),
        remotePort: fwdForm.forwardType === "dynamic" ? 0 : Number(fwdForm.remotePort),
        autoStart: fwdForm.autoStart,
      };
      if (editingId) {
        await update(editingId, payload);
      } else {
        await create({ serverId, ...payload });
      }
      cancelEdit();
    } catch (e) {
      setFwdError(formatError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await remove(id).catch(() => {});
    if (editingId === id) cancelEdit();
  };

  const isDynamic = fwdForm.forwardType === "dynamic";

  return (
    <div className="border-t border-stroke-subtle pt-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-secondary">Port Forwards</p>
        {!adding && (
          <button
            type="button"
            onClick={openAdd}
            className="text-xs text-accent hover:text-accent-hover transition-colors"
          >
            + Add
          </button>
        )}
      </div>

      {serverForwards.length > 0 && (
        <div className="space-y-1 mb-3">
          {serverForwards.map((fwd) => (
            <div
              key={fwd.id}
              className="flex items-center justify-between gap-2 px-3 py-2 bg-surface-0 rounded-lg text-xs"
            >
              <div className="min-w-0">
                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium mr-1.5 ${
                  fwd.forwardType === "local"   ? "bg-blue-950 text-blue-300" :
                  fwd.forwardType === "dynamic" ? "bg-purple-950 text-purple-300" :
                                                  "bg-orange-950 text-orange-300"
                }`}>
                  {fwd.forwardType}
                </span>
                <span className="text-white font-mono">
                  {fwd.forwardType === "dynamic"
                    ? `localhost:${fwd.localPort}`
                    : `localhost:${fwd.localPort} → ${fwd.remoteHost}:${fwd.remotePort}`}
                </span>
                {fwd.label && <span className="text-faint ml-1.5">({fwd.label})</span>}
                {fwd.autoStart && <span className="text-faint ml-1.5">auto</span>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => openEdit(fwd)}
                  className="text-muted hover:text-white transition-colors"
                  aria-label="Edit"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 2l3 3-8 8H3v-3l8-8z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setPendingDeleteId(fwd.id)}
                  className="text-muted hover:text-red-400 transition-colors"
                  aria-label="Delete"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h10M6 4V2h4v2M5 4l1 9h4l1-9" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div className="space-y-3 p-3 bg-surface-0 border border-stroke-subtle rounded-lg">
          <div className="flex h-10 rounded border border-stroke overflow-hidden">
            {FORWARD_TYPES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setFwdForm((f) => ({ ...f, forwardType: value }))}
                className={`flex-1 h-full text-sm transition-colors ${
                  fwdForm.forwardType === value
                    ? "bg-accent text-black font-semibold"
                    : "bg-surface-3 text-muted hover:text-white hover:bg-surface-4"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <p className="text-meta text-faint -mt-1">
            {FORWARD_TYPES.find((t) => t.value === fwdForm.forwardType)?.hint}
          </p>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs text-secondary mb-1">Local port</label>
              <Input
                type="number"
                value={fwdForm.localPort}
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
                    value={fwdForm.remoteHost}
                    onChange={setF("remoteHost")}
                    placeholder="db.internal"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-secondary mb-1">Remote port</label>
                  <Input
                    type="number"
                    value={fwdForm.remotePort}
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
                value={fwdForm.label}
                onChange={setF("label")}
                placeholder="e.g. Postgres"
              />
            </div>
            <label className="flex items-center gap-1.5 pb-2.5 text-xs text-secondary cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={fwdForm.autoStart}
                onChange={setF("autoStart")}
                className="rounded border-stroke bg-surface-3 text-accent-fg"
              />
              Auto-start
            </label>
          </div>

          {fwdError && <p className="text-xs text-error">{fwdError}</p>}

          <div className="flex gap-2">
            <Button type="button" onClick={cancelEdit} className="flex-1">
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => { void handleSave(); }}
              disabled={saving}
              className="flex-1"
            >
              {saving ? "Saving…" : editingId ? "Update" : "Add"}
            </Button>
          </div>
        </div>
      )}

      {serverForwards.length === 0 && !adding && (
        <p className="text-meta text-faint">No port forwards. Click + Add to create one.</p>
      )}

      {pendingDeleteId && (
        <ConfirmDeleteModal
          title="Delete port forward?"
          description="This port forward will be permanently removed. This cannot be undone."
          onConfirm={() => { void handleDelete(pendingDeleteId); setPendingDeleteId(null); }}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </div>
  );
}
