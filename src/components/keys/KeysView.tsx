import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { homeDir, join } from "@tauri-apps/api/path";
import { useSshKeyStore } from "../../store/sshKeyStore";
import { clipboardCommands } from "../../lib/tauriCommands";
import { formatError } from "../../lib/errors";
import type { SshKey } from "../../types/sshKey";
import Button from "../shared/Button";
import Input from "../shared/Input";
import EmptyState from "../shared/EmptyState";
import ConfirmDeleteModal from "../shared/ConfirmDeleteModal";

// ── Add Existing Key modal ────────────────────────────────────────────────────

function AddKeyModal({ onClose }: { onClose: () => void }) {
  const addKey = useSshKeyStore((s) => s.addKey);
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const browse = async () => {
    try {
      const home = await homeDir();
      const sshDir = await join(home, ".ssh");
      const result = await open({ multiple: false, title: "Select SSH Private Key", defaultPath: sshDir });
      if (typeof result === "string") setPath(result);
    } catch {
      // user cancelled
    }
  };

  const submit = async () => {
    if (!path.trim()) { setError("Path is required"); return; }
    setSaving(true);
    setError(null);
    try {
      await addKey(path.trim(), name.trim() || undefined);
      onClose();
    } catch (e) {
      setError(formatError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 animate-backdrop-in"
      onClick={onClose}
    >
      <div
        className="bg-surface-2 border border-stroke rounded-xl shadow-overlay animate-overlay-in w-full max-w-md mx-4 p-6 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-title text-white">Add Existing Key</h2>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-secondary">Private key path</label>
            <div className="flex gap-2">
              <Input
                value={path}
                onChange={(e) => { setPath(e.target.value); setError(null); }}
                placeholder="~/.ssh/id_ed25519"
                className="flex-1"
                autoFocus
              />
              <Button type="button" onClick={() => { void browse(); }} className="px-3 border border-stroke shrink-0">
                Browse
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-secondary">
              Display name <span className="text-faint">(optional)</span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My deploy key"
              onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
            />
          </div>
          {error && <p className="text-xs text-error">{error}</p>}
        </div>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={() => { void submit(); }} disabled={saving || !path.trim()}>
            {saving ? "Adding…" : "Add Key"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Generate New Key modal ────────────────────────────────────────────────────

type KeyType = "ed25519" | "rsa" | "ecdsa";

interface GenForm {
  name: string;
  keyType: KeyType;
  outputPath: string;
  passphrase: string;
  confirmPassphrase: string;
}

const BLANK_GEN: GenForm = {
  name: "",
  keyType: "ed25519",
  outputPath: "~/.ssh/",
  passphrase: "",
  confirmPassphrase: "",
};

function GenerateKeyModal({ onClose }: { onClose: () => void }) {
  const generateKey = useSshKeyStore((s) => s.generateKey);
  const [form, setForm] = useState<GenForm>(BLANK_GEN);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const set = (field: keyof GenForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setForm((f) => ({ ...f, [field]: e.target.value }));
      setError(null);
    };

  const submit = async () => {
    if (!form.name.trim()) { setError("Name is required"); return; }
    if (!form.outputPath.trim()) { setError("Output path is required"); return; }
    if (form.passphrase !== form.confirmPassphrase) { setError("Passphrases do not match"); return; }
    setSaving(true);
    setError(null);
    try {
      await generateKey({
        name: form.name.trim(),
        keyType: form.keyType,
        outputPath: form.outputPath.trim(),
        passphrase: form.passphrase || undefined,
      });
      onClose();
    } catch (e) {
      setError(formatError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 animate-backdrop-in"
      onClick={onClose}
    >
      <div
        className="bg-surface-2 border border-stroke rounded-xl shadow-overlay animate-overlay-in w-full max-w-md mx-4 p-6 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-title text-white">Generate New Key</h2>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-secondary">Name</label>
            <Input value={form.name} onChange={set("name")} placeholder="My server key" autoFocus />
          </div>
          <div className="flex gap-3">
            <div className="flex flex-col gap-1.5 flex-1">
              <label className="text-sm text-secondary">Key type</label>
              <select
                value={form.keyType}
                onChange={set("keyType")}
                className="h-10 bg-surface-3 border border-white/5 rounded px-3 text-sm text-white focus:outline-none focus:border-accent/30 transition-[border-color] duration-200"
              >
                <option value="ed25519">Ed25519 (recommended)</option>
                <option value="rsa">RSA 4096</option>
                <option value="ecdsa">ECDSA 521</option>
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-secondary">Save to</label>
            <Input
              value={form.outputPath}
              onChange={set("outputPath")}
              placeholder="~/.ssh/id_ed25519"
            />
            <p className="text-xs text-faint">Public key will be saved alongside as <code className="font-mono">.pub</code></p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-secondary">
              Passphrase <span className="text-faint">(optional)</span>
            </label>
            <Input
              type="password"
              value={form.passphrase}
              onChange={set("passphrase")}
              placeholder="Leave empty for no passphrase"
              autoComplete="new-password"
            />
          </div>
          {form.passphrase && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-secondary">Confirm passphrase</label>
              <Input
                type="password"
                value={form.confirmPassphrase}
                onChange={set("confirmPassphrase")}
                placeholder="Re-enter passphrase"
                autoComplete="new-password"
                onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
              />
            </div>
          )}
          {error && <p className="text-xs text-error">{error}</p>}
        </div>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={() => { void submit(); }} disabled={saving}>
            {saving ? "Generating…" : "Generate"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Key row ───────────────────────────────────────────────────────────────────

const KEY_TYPE_BADGE: Record<string, string> = {
  ed25519: "bg-green-950/60 border-green-900/60 text-green-400",
  ecdsa:   "bg-blue-950/60 border-blue-900/60 text-blue-400",
  rsa:     "bg-purple-950/60 border-purple-900/60 text-purple-400",
  dsa:     "bg-yellow-950/60 border-yellow-900/60 text-yellow-500",
  unknown: "bg-surface-3 border-stroke text-faint",
};

function KeyRow({ sshKey, onDelete }: { sshKey: SshKey; onDelete: () => void }) {
  const getPublicKey = useSshKeyStore((s) => s.getPublicKey);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const copyPublicKey = async () => {
    setCopyError(null);
    try {
      const pub = await getPublicKey(sshKey.id);
      await clipboardCommands.writeText(pub.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      setCopyError(formatError(e));
      setTimeout(() => setCopyError(null), 4000);
    }
  };

  const badge = KEY_TYPE_BADGE[sshKey.keyType] ?? KEY_TYPE_BADGE.unknown;

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-surface-1 border border-stroke-subtle rounded-lg hover:border-stroke transition-colors group">
      <div className="w-8 h-8 rounded-lg bg-surface-2 border border-stroke-subtle flex items-center justify-center text-faint shrink-0">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 2a4 4 0 100 8 4 4 0 000-8zM6.5 7.5L2 12" />
          <path d="M3.5 13.5l1-1M5.5 13.5l1-1" />
        </svg>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-medium text-white truncate">{sshKey.name}</span>
          <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded border ${badge} shrink-0`}>
            {sshKey.keyType.toUpperCase()}
          </span>
          {sshKey.isEncrypted && (
            <span className="text-[11px] font-medium px-1.5 py-0.5 rounded border bg-warning-subtle border-warning-subtle text-warning shrink-0">
              passphrase
            </span>
          )}
        </div>
        <p className="text-xs text-faint font-mono truncate">{sshKey.keyPath}</p>
        {sshKey.fingerprint && (
          <p className="text-[11px] text-dim font-mono truncate mt-0.5">{sshKey.fingerprint}</p>
        )}
        {copyError && <p className="text-xs text-error mt-0.5">{copyError}</p>}
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={() => { void copyPublicKey(); }}
          title="Copy public key"
          className={`h-8 px-2.5 rounded text-xs font-medium transition-colors ${
            copied
              ? "bg-success-subtle text-success border border-success-subtle"
              : "bg-surface-3 text-secondary border border-stroke hover:border-accent/40 hover:text-white"
          }`}
        >
          {copied ? "Copied!" : "Copy pub key"}
        </button>
        <button
          onClick={onDelete}
          title="Remove from vault"
          className="w-8 h-8 flex items-center justify-center rounded text-faint hover:text-error hover:bg-error-subtle transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export default function KeysView() {
  const keys = useSshKeyStore((s) => s.keys);
  const isLoading = useSshKeyStore((s) => s.isLoading);
  const error = useSshKeyStore((s) => s.error);
  const load = useSshKeyStore((s) => s.load);
  const removeKey = useSshKeyStore((s) => s.removeKey);

  const [showAdd, setShowAdd] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SshKey | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { void load(); }, [load]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await removeKey(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-stroke-subtle shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-white">SSH Keys</h1>
          <p className="text-sm text-faint mt-0.5">Manage private keys used for authentication</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowGenerate(true)}>
            <svg className="w-3.5 h-3.5 mr-1.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2v12M2 8h12" />
            </svg>
            Generate
          </Button>
          <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}>
            <svg className="w-3.5 h-3.5 mr-1.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2v12M2 8h12" />
            </svg>
            Add Existing
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-faint">Loading…</p>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-error">{error}</p>
          </div>
        ) : keys.length === 0 ? (
          <EmptyState
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 2a4 4 0 100 8 4 4 0 000-8zM6.5 7.5L2 12" />
              </svg>
            }
            heading="No keys in vault"
            subline="Add an existing private key or generate a new one."
            action={{ label: "Add Existing Key", onClick: () => setShowAdd(true) }}
          />
        ) : (
          <div className="p-6 flex flex-col gap-2">
            {keys.map((k) => (
              <KeyRow
                key={k.id}
                sshKey={k}
                onDelete={() => setDeleteTarget(k)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showAdd && <AddKeyModal onClose={() => setShowAdd(false)} />}
      {showGenerate && <GenerateKeyModal onClose={() => setShowGenerate(false)} />}
      {deleteTarget && (
        <ConfirmDeleteModal
          title="Remove key from vault?"
          description={
            <>
              <strong className="text-white">{deleteTarget.name}</strong> will be removed from the key registry.{" "}
              The key file at <code className="font-mono text-xs">{deleteTarget.keyPath}</code> is not deleted from disk.
            </>
          }
          confirmLabel="Remove"
          busy={deleting}
          onConfirm={() => { void handleDelete(); }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
