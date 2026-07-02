import { useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { homeDir, join } from "@tauri-apps/api/path";
import { useSshKeyStore } from "../../store/sshKeyStore";
import { useServerStore } from "../../store/serverStore";
import { clipboardCommands } from "../../lib/commands/local";
import { formatError } from "../../lib/errors";
import type { SshKey } from "../../types/sshKey";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import EmptyState from "../shared/EmptyState";
import ConfirmDeleteModal from "../shared/ConfirmDeleteModal";

function useEscapeToClose(onClose: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
}

// ── Add Existing Key modal ────────────────────────────────────────────────────

function AddKeyModal({ onClose }: { onClose: () => void }) {
  const addKey = useSshKeyStore((s) => s.addKey);
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEscapeToClose(onClose);

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
              <Button type="button" variant="secondary" size="lg" onClick={() => { void browse(); }} className="border border-stroke shrink-0">
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
          <Button variant="secondary" size="lg" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="lg" onClick={() => { void submit(); }} disabled={saving || !path.trim()}>
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
  const [pathEdited, setPathEdited] = useState(false);

  useEscapeToClose(onClose);

  const set = (field: keyof GenForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value = e.target.value;
      setForm((f) => {
        const next = { ...f, [field]: value };
        if (field === "name" && !pathEdited) {
          const filename = value.toLowerCase().replace(/\s+/g, "_");
          next.outputPath = filename ? `~/.ssh/${filename}` : "~/.ssh/";
        }
        return next;
      });
      setError(null);
    };

  const handlePathChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPathEdited(true);
    setForm((f) => ({ ...f, outputPath: e.target.value }));
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
              <Select
                value={form.keyType}
                onValueChange={(value) => {
                  setForm((f) => ({ ...f, keyType: value as KeyType }));
                  setError(null);
                }}
              >
                <SelectTrigger className="w-full h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ed25519">Ed25519 (recommended)</SelectItem>
                  <SelectItem value="rsa">RSA 4096</SelectItem>
                  <SelectItem value="ecdsa">ECDSA 521</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-secondary">Save to</label>
            <Input
              value={form.outputPath}
              onChange={handlePathChange}
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
          <Button variant="secondary" size="lg" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="lg" onClick={() => { void submit(); }} disabled={saving}>
            {saving ? "Generating…" : "Generate"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── View Public Key modal ─────────────────────────────────────────────────────

function ViewPublicKeyModal({ sshKey, onClose }: { sshKey: SshKey; onClose: () => void }) {
  const getPublicKey = useSshKeyStore((s) => s.getPublicKey);
  const [pubKey, setPubKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEscapeToClose(onClose);

  useEffect(() => {
    getPublicKey(sshKey.id)
      .then(setPubKey)
      .catch((e: unknown) => setError(formatError(e)));
  }, [sshKey.id, getPublicKey]);

  const copy = async () => {
    if (!pubKey) return;
    await clipboardCommands.writeText(pubKey.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 animate-backdrop-in"
      onClick={onClose}
    >
      <div
        className="bg-surface-2 border border-stroke rounded-xl shadow-overlay animate-overlay-in w-full max-w-lg mx-4 p-6 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-title text-white">Public Key</h2>
            <p className="text-xs text-faint mt-0.5 font-mono">{sshKey.keyPath}.pub</p>
          </div>
          <button
            onClick={onClose}
            className="text-faint hover:text-white p-1 rounded transition-colors shrink-0"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5}>
              <path d="M2 2l12 12M14 2L2 14" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {error ? (
          <p className="text-xs text-error">{error}</p>
        ) : pubKey === null ? (
          <p className="text-sm text-faint">Loading…</p>
        ) : (
          <div className="bg-surface-1 border border-stroke rounded-lg p-3 max-h-48 overflow-y-auto">
            <pre className="text-xs text-secondary font-mono break-all whitespace-pre-wrap select-all">
              {pubKey.trim()}
            </pre>
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <Button variant="secondary" size="lg" onClick={onClose}>Close</Button>
          <Button
            size="lg"
            onClick={() => { void copy(); }}
            disabled={!pubKey}
            className={copied ? "bg-success/20 text-success border border-success/30" : ""}
          >
            {copied ? "Copied!" : "Copy to Clipboard"}
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

function KeyRow({
  sshKey,
  usageCount,
  onDelete,
  onViewPub,
}: {
  sshKey: SshKey;
  usageCount: number;
  onDelete: () => void;
  onViewPub: () => void;
}) {
  const renameKey = useSshKeyStore((s) => s.renameKey);
  const getPublicKey = useSshKeyStore((s) => s.getPublicKey);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(sshKey.name);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameSaving, setRenameSaving] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const startRename = () => {
    setRenameValue(sshKey.name);
    setRenameError(null);
    setIsRenaming(true);
    // Focus after render
    setTimeout(() => renameInputRef.current?.select(), 0);
  };

  const cancelRename = () => {
    setIsRenaming(false);
    setRenameError(null);
  };

  const commitRename = async () => {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === sshKey.name) { cancelRename(); return; }
    setRenameSaving(true);
    setRenameError(null);
    try {
      await renameKey(sshKey.id, trimmed);
      setIsRenaming(false);
    } catch (e) {
      setRenameError(formatError(e));
    } finally {
      setRenameSaving(false);
    }
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { void commitRename(); }
    if (e.key === "Escape") { cancelRename(); }
  };

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
        {isRenaming ? (
          <div className="flex items-center gap-2 mb-0.5">
            <Input
              ref={renameInputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={handleRenameKeyDown}
              onBlur={() => { void commitRename(); }}
              autoFocus
              className="h-7 text-sm py-0 px-2 flex-1"
              disabled={renameSaving}
            />
            {renameError && <p className="text-xs text-error shrink-0">{renameError}</p>}
          </div>
        ) : (
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
        )}
        <p className="text-xs text-faint font-mono truncate">{sshKey.keyPath}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {sshKey.fingerprint && (
            <p className="text-[11px] text-dim font-mono truncate">{sshKey.fingerprint}</p>
          )}
          {usageCount > 0 && (
            <span className="text-[11px] text-dim shrink-0">
              · used by {usageCount} {usageCount === 1 ? "server" : "servers"}
            </span>
          )}
        </div>
        {copyError && <p className="text-xs text-error mt-0.5">{copyError}</p>}
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <Button
          variant="ghost"
          onClick={onViewPub}
          title="View public key"
          className="h-8 px-2.5 text-xs font-medium bg-surface-3 text-secondary border border-stroke hover:border-accent/40 hover:text-white"
        >
          View pub
        </Button>
        <Button
          variant="ghost"
          onClick={() => { void copyPublicKey(); }}
          title="Copy public key"
          className={`h-8 px-2.5 text-xs font-medium ${
            copied
              ? "bg-success-subtle text-success border border-success-subtle"
              : "bg-surface-3 text-secondary border border-stroke hover:border-accent/40 hover:text-white"
          }`}
        >
          {copied ? "Copied!" : "Copy pub"}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={startRename}
          title="Rename key"
          className="text-faint hover:text-white hover:bg-surface-3"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M11.5 2.5a2.121 2.121 0 013 3L5 15H2v-3L11.5 2.5z" />
          </svg>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          title="Remove from vault"
          className="text-faint hover:text-error hover:bg-error-subtle"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10" />
          </svg>
        </Button>
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

  const servers = useServerStore((s) => s.servers);

  const [showAdd, setShowAdd] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SshKey | null>(null);
  const [viewPubTarget, setViewPubTarget] = useState<SshKey | null>(null);
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

  const usageByPath = useMemo(() => {
    const map = new Map<string, number>();
    for (const server of servers) {
      if (server.identityFilePath) {
        map.set(server.identityFilePath, (map.get(server.identityFilePath) ?? 0) + 1);
      }
    }
    return map;
  }, [servers]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-stroke-subtle shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-white">Vault</h1>
          <p className="text-sm text-faint mt-0.5">Manage private keys used for authentication</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setShowGenerate(true)}>
            <svg className="w-3.5 h-3.5 mr-1.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2v12M2 8h12" />
            </svg>
            Generate
          </Button>
          <Button onClick={() => setShowAdd(true)}>
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
                usageCount={usageByPath.get(k.keyPath) ?? 0}
                onDelete={() => setDeleteTarget(k)}
                onViewPub={() => setViewPubTarget(k)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showAdd && <AddKeyModal onClose={() => setShowAdd(false)} />}
      {showGenerate && <GenerateKeyModal onClose={() => setShowGenerate(false)} />}
      {viewPubTarget && (
        <ViewPublicKeyModal
          sshKey={viewPubTarget}
          onClose={() => setViewPubTarget(null)}
        />
      )}
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
