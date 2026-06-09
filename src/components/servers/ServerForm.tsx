import { useState, useEffect, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { homeDir, join } from "@tauri-apps/api/path";
import type { AuthMethod, Tag } from "../../types/server";
import { useServerStore } from "../../store/serverStore";
import { useUiStore } from "../../store/uiStore";
import { serverCommands, vaultCommands } from "../../lib/tauriCommands";
import { useVaultStore } from "../../store/vaultStore";
import { useSshKeyStore } from "../../store/sshKeyStore";
import { formatError } from "../../lib/errors";
import Input from "../shared/Input";
import Button from "../shared/Button";
import PortForwardsSection from "./PortForwardsSection";

interface FormData {
  displayName: string;
  hostname: string;
  port: number;
  username: string;
  authMethod: AuthMethod;
  identityFilePath: string;
  groupId: string;
  isJumpHost: boolean;
  jumpHostId: string;
}

const DEFAULT_FORM: FormData = {
  displayName: "",
  hostname: "",
  port: 22,
  username: "",
  authMethod: "key",
  identityFilePath: "",
  groupId: "",
  isJumpHost: false,
  jumpHostId: "",
};

export default function ServerForm() {
  const { activeView, editingServerId, closeForm } = useUiStore();
  const isEdit = activeView === "edit";

  const servers = useServerStore((s) => s.servers);
  const groups = useServerStore((s) => s.groups);
  const createServer = useServerStore((s) => s.createServer);
  const updateServer = useServerStore((s) => s.updateServer);
  const createGroup = useServerStore((s) => s.createGroup);
  const createTag = useServerStore((s) => s.createTag);

  const existingServer = isEdit && editingServerId
    ? servers.find((s) => s.id === editingServerId)
    : undefined;

  const isVaultUnlocked = useVaultStore((s) => s.isUnlocked);
  const isPasswordRequired = useVaultStore((s) => s.isPasswordRequired);
  const vaultAvailable = !isPasswordRequired || isVaultUnlocked;

  const managedKeys = useSshKeyStore((s) => s.keys);
  const loadKeys = useSshKeyStore((s) => s.load);
  useEffect(() => { void loadKeys(); }, [loadKeys]);

  const [form, setForm] = useState<FormData>(DEFAULT_FORM);
  const [password, setPassword] = useState("");
  const [tags, setTags] = useState<Tag[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [, setTouched] = useState<Set<keyof FormData>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const tagDropdownRef = useRef<HTMLDivElement>(null);
  const allTags = useServerStore((s) => s.tags);

  useEffect(() => {
    if (existingServer) {
      setForm({
        displayName: existingServer.displayName,
        hostname: existingServer.hostname,
        port: Number(existingServer.port),
        username: existingServer.username,
        authMethod: existingServer.authMethod as AuthMethod,
        identityFilePath: existingServer.identityFilePath ?? "",
        groupId: existingServer.groupId ?? "",
        isJumpHost: existingServer.isJumpHost,
        jumpHostId: existingServer.jumpHostId ?? "",
      });
      setTags(existingServer.tags);
    } else {
      setForm(DEFAULT_FORM);
      setTags([]);
    }
    setErrors({});
    setTouched(new Set());
    setDirty(false);
    setTagInput("");
    setTagDropdownOpen(false);
    setShowNewGroup(false);
    setNewGroupName("");
  }, [existingServer, activeView]);

  const set = (field: keyof FormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const value = e.target.type === "checkbox"
        ? (e.target as HTMLInputElement).checked
        : e.target.type === "number"
          ? Number(e.target.value)
          : e.target.value;
      setForm((f) => ({ ...f, [field]: value }));
      setDirty(true);
      setErrors((errs) => { const next = { ...errs }; delete next[field]; return next; });
    };

  const validateField = (field: keyof FormData, value: unknown) => {
    setTouched((t) => new Set(t).add(field));
    const errs: Record<string, string> = {};
    if (field === "displayName" && !String(value).trim()) errs.displayName = "Required";
    if (field === "hostname" && !String(value).trim()) errs.hostname = "Required";
    if (field === "port") {
      const n = Number(value);
      if (n < 1 || n > 65535) errs.port = "Must be 1–65535";
    }
    setErrors((prev) => ({ ...prev, ...errs }));
  };

  const handleClose = () => {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    closeForm();
  };

  const tagSuggestions = allTags.filter(
    (t) => !tags.some((x) => x.id === t.id) && t.name.toLowerCase().includes(tagInput.toLowerCase()),
  );

  const pickIdentityFile = async () => {
    try {
      const home = await homeDir();
      const sshDir = await join(home, ".ssh");
      const result = await open({
        multiple: false,
        title: "Select SSH Identity File",
        defaultPath: sshDir,
      });
      if (typeof result === "string") {
        setForm((f) => ({ ...f, identityFilePath: result }));
      }
    } catch {
      // User cancelled — no action needed
    }
  };

  const addTag = async () => {
    const name = tagInput.trim();
    if (!name) return;
    try {
      const tag = await serverCommands.createTag(name);
      if (!tags.some((t) => t.id === tag.id)) {
        setTags((ts) => [...ts, tag]);
        await createTag(name); // sync global tag list
      }
      setTagInput("");
      tagInputRef.current?.focus();
    } catch (e) {
      setErrors((errs) => ({ ...errs, tag: formatError(e) }));
    }
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      void addTag();
    }
  };

  const handleGroupChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value === "__create_new__") {
      setShowNewGroup(true);
      setForm((f) => ({ ...f, groupId: "" }));
    } else {
      setShowNewGroup(false);
      setForm((f) => ({ ...f, groupId: e.target.value }));
    }
  };

  const handleCreateGroup = async () => {
    const name = newGroupName.trim();
    if (!name) return;
    try {
      const group = await createGroup(name);
      setForm((f) => ({ ...f, groupId: group.id }));
      setNewGroupName("");
      setShowNewGroup(false);
    } catch (e) {
      setErrors((errs) => ({ ...errs, group: formatError(e) }));
    }
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.displayName.trim()) errs.displayName = "Required";
    if (!form.hostname.trim()) errs.hostname = "Required";
    if (form.port < 1 || form.port > 65535) errs.port = "Must be 1–65535";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    let freshCredentialId: string | undefined;
    try {
      // Store password in vault if provided, reuse existing credential ID otherwise
      let vaultCredentialId: string | undefined = isEdit
        ? existingServer?.vaultCredentialId
        : undefined;
      if (form.authMethod === "password" && password.trim()) {
        freshCredentialId = await vaultCommands.storeCredential(password.trim());
        vaultCredentialId = freshCredentialId;
      }

      const payload = {
        displayName: form.displayName.trim(),
        hostname: form.hostname.trim(),
        port: form.port,
        username: form.username.trim() || undefined,
        authMethod: form.authMethod,
        identityFilePath: form.identityFilePath.trim() || undefined,
        vaultCredentialId,
        groupId: form.groupId || undefined,
        isJumpHost: form.isJumpHost,
        jumpHostId: form.jumpHostId || undefined,
        tagIds: tags.map((t) => t.id),
      };

      if (isEdit && editingServerId) {
        await updateServer(editingServerId, payload);
      } else {
        await createServer(payload);
      }
      setSaved(true);
      setTimeout(closeForm, 600);
    } catch (e) {
      // Clean up the freshly-stored credential if the server row was never created.
      if (freshCredentialId) {
        vaultCommands.deleteCredential(freshCredentialId).catch(() => {});
      }
      setErrors((errs) => ({ ...errs, submit: formatError(e) }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/85 animate-backdrop-in flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="bg-surface-1 border border-stroke-subtle rounded-xl shadow-overlay animate-overlay-in w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stroke-subtle shrink-0">
          <h2 className="text-lg font-semibold text-white">
            {isEdit ? "Edit Server" : "Add Server"}
          </h2>
          <button
            onClick={handleClose}
            className="text-muted hover:text-white p-1 rounded"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form id="server-form" onSubmit={(e) => { void handleSubmit(e); }} className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {/* Display Name */}
          <Field label="Display Name" error={errors.displayName} required>
            <Input
              id="displayName"
              value={form.displayName}
              onChange={set("displayName")}
              onBlur={(e) => validateField("displayName", e.target.value)}
              placeholder="Production Web Server"
              error={!!errors.displayName}
            />
          </Field>

          {/* Hostname */}
          <Field label="Hostname / IP" error={errors.hostname} required>
            <Input
              id="hostname"
              value={form.hostname}
              onChange={set("hostname")}
              onBlur={(e) => validateField("hostname", e.target.value)}
              placeholder="web.example.com"
              error={!!errors.hostname}
            />
          </Field>

          {/* Port + Username */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Port" error={errors.port} required>
              <Input
                id="port"
                type="number"
                min={1}
                max={65535}
                value={form.port}
                onChange={set("port")}
                onBlur={(e) => validateField("port", e.target.value)}
                error={!!errors.port}
              />
            </Field>
            <Field label="Username">
              <Input
                id="username"
                value={form.username}
                onChange={set("username")}
                placeholder="ubuntu"
              />
            </Field>
          </div>

          {/* Auth Method */}
          <Field label="Auth Method">
            <div className="flex h-10 rounded border border-stroke overflow-hidden">
              {(["key", "password"] as const).map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => { setForm((f) => ({ ...f, authMethod: method })); setDirty(true); }}
                  className={`flex-1 h-full text-sm transition-colors ${
                    form.authMethod === method
                      ? "bg-accent text-black font-semibold"
                      : "bg-surface-3 text-muted hover:text-white hover:bg-surface-4"
                  }`}
                >
                  {method === "key" ? "SSH Key" : "Password"}
                </button>
              ))}
            </div>
          </Field>

          {/* Password */}
          {form.authMethod === "password" && (
            <Field label={isEdit && existingServer?.vaultCredentialId ? "New Password (leave blank to keep existing)" : "Password"}>
              {!vaultAvailable ? (
                <p className="text-xs text-yellow-500">Unlock the vault to store a password.</p>
              ) : (
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isEdit && existingServer?.vaultCredentialId ? "Enter new password to change…" : "SSH password"}
                  autoComplete="new-password"
                />
              )}
            </Field>
          )}

          {/* Identity File */}
          {form.authMethod === "key" && (
            <Field label="Identity File">
              {managedKeys.length > 0 && (
                <select
                  className="w-full h-10 bg-surface-3 border border-white/5 rounded px-3 text-sm text-white mb-2 focus:outline-none focus:border-accent/30 transition-[border-color] duration-200"
                  value={managedKeys.some((k) => k.keyPath === form.identityFilePath) ? form.identityFilePath : ""}
                  onChange={(e) => {
                    if (e.target.value) setForm((f) => ({ ...f, identityFilePath: e.target.value }));
                  }}
                >
                  <option value="">— pick a managed key —</option>
                  {managedKeys.map((k) => (
                    <option key={k.id} value={k.keyPath}>
                      {k.name} ({k.keyType.toUpperCase()})
                    </option>
                  ))}
                </select>
              )}
              <div className="flex gap-2">
                <Input
                  id="identityFilePath"
                  value={form.identityFilePath}
                  onChange={set("identityFilePath")}
                  placeholder="~/.ssh/id_ed25519"
                  className="flex-1"
                />
                <Button
                  type="button"
                  onClick={() => { void pickIdentityFile(); }}
                  className="px-3 border border-stroke shrink-0"
                >
                  Browse
                </Button>
              </div>
            </Field>
          )}

          {/* Group */}
          <Field label="Group" error={errors.group}>
            {!showNewGroup ? (
              <SelectWrapper>
                <select
                  id="groupId"
                  value={form.groupId}
                  onChange={handleGroupChange}
                  className={select()}
                >
                  <option value="">No Group</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                  <option value="__create_new__">＋ Create new group…</option>
                </select>
              </SelectWrapper>
            ) : (
              <div className="flex gap-2">
                <Input
                  autoFocus
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleCreateGroup(); } }}
                  placeholder="Group name"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => { void handleCreateGroup(); }}
                  className="px-3 shrink-0"
                >
                  Add
                </Button>
                <Button
                  type="button"
                  onClick={() => { setShowNewGroup(false); setNewGroupName(""); }}
                  className="px-3 shrink-0"
                >
                  Cancel
                </Button>
              </div>
            )}
          </Field>

          {/* Tags */}
          <Field label="Tags" error={errors.tag}>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {tags.map((t) => (
                  <span key={t.id} className="flex items-center gap-1 bg-surface-3 border border-stroke text-muted text-xs px-2 py-1 rounded-full">
                    #{t.name}
                    <button
                      type="button"
                      onClick={() => setTags((ts) => ts.filter((x) => x.id !== t.id))}
                      className="text-muted hover:text-white leading-none"
                      aria-label={`Remove tag ${t.name}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="relative" ref={tagDropdownRef}>
              <Input
                ref={tagInputRef}
                value={tagInput}
                onChange={(e) => { setTagInput(e.target.value); setTagDropdownOpen(true); }}
                onFocus={() => setTagDropdownOpen(true)}
                onBlur={() => setTimeout(() => setTagDropdownOpen(false), 150)}
                onKeyDown={handleTagKeyDown}
                placeholder="Type a tag and press Enter"
              />
              {tagDropdownOpen && tagSuggestions.length > 0 && (
                <div className="absolute z-20 top-full mt-1 w-full bg-surface-2 border border-stroke rounded-lg shadow-overlay max-h-40 overflow-y-auto">
                  {tagSuggestions.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); setTags((ts) => [...ts, t]); setTagInput(""); setTagDropdownOpen(false); }}
                      className="w-full text-left px-3 py-2 text-sm text-secondary hover:bg-surface-4 hover:text-white transition-colors"
                    >
                      #{t.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Field>

          {/* Jump Host */}
          <Field label="">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isJumpHost}
                onChange={set("isJumpHost")}
                className="rounded border-stroke bg-surface-3 text-accent-fg"
              />
              <span className="text-sm text-secondary">This server is a jump host / bastion</span>
            </label>
          </Field>

          {/* Jump through */}
          {!form.isJumpHost && (
            <Field label="Jump Host (optional)">
              <SelectWrapper>
                <select
                  id="jumpHostId"
                  value={form.jumpHostId}
                  onChange={set("jumpHostId")}
                  className={select()}
                >
                  <option value="">Direct connection</option>
                  {servers
                    .filter((s) => s.isJumpHost && s.id !== editingServerId)
                    .map((s) => (
                      <option key={s.id} value={s.id}>{s.displayName}</option>
                    ))}
                </select>
              </SelectWrapper>

              {/* Visual chain display */}
              {form.jumpHostId && (() => {
                const chain: string[] = ["Your machine"];
                let id: string | undefined = form.jumpHostId;
                const visited = new Set<string>();
                while (id && !visited.has(id)) {
                  visited.add(id);
                  const hop = servers.find((s) => s.id === id);
                  if (!hop) break;
                  chain.push(hop.displayName);
                  id = hop.jumpHostId ?? undefined;
                }
                const target = form.displayName.trim() || "this server";
                chain.push(target);
                return (
                  <div className="mt-2 flex items-center flex-wrap gap-1 text-meta text-faint">
                    {chain.map((label, i) => (
                      <span key={i} className="flex items-center gap-1">
                        <span className={i === 0 || i === chain.length - 1
                          ? "text-muted"
                          : "text-secondary font-medium"}>
                          {label}
                        </span>
                        {i < chain.length - 1 && <span className="text-dim">→</span>}
                      </span>
                    ))}
                  </div>
                );
              })()}
            </Field>
          )}


          {/* Port Forwards */}
          {isEdit && editingServerId && (
            <PortForwardsSection serverId={editingServerId} />
          )}
          {!isEdit && (
            <p className="text-meta text-faint px-1">
              Port forwards can be configured after saving the server.
            </p>
          )}

          {errors.submit && (
            <p className="text-sm text-error bg-error-subtle border border-error-subtle rounded-md px-3 py-2">
              {errors.submit}
            </p>
          )}
        </form>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-stroke-subtle shrink-0">
          <Button type="button" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" form="server-form" variant="primary" disabled={submitting}>
            {saved ? "Saved ✓" : submitting ? "Saving…" : isEdit ? "Save Changes" : "Add Server"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────────

// NOTE: PortForwardsSection lives in ./PortForwardsSection.tsx

// Field, SelectWrapper, and select() helpers follow below.
function Field({
  label,
  children,
  error,
  required,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
  required?: boolean;
}) {
  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-secondary mb-1">
          {label}
          {required && <span className="text-error ml-0.5">*</span>}
        </label>
      )}
      {children}
      {error && <p className="text-xs text-error mt-1">{error}</p>}
    </div>
  );
}

function SelectWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      {children}
      <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted">
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </div>
    </div>
  );
}

const select = () =>
  "w-full h-10 appearance-none bg-surface-3 border border-stroke rounded px-3 pr-10 text-sm text-white focus:outline-none focus:border-accent transition-colors";
