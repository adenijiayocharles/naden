import { useState, useEffect, useRef } from "react";
import { FolderOpen } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { homeDir, join } from "@tauri-apps/api/path";
import type { AuthMethod, Tag } from "../../types/server";
import { useServerStore } from "../../store/serverStore";
import { useUiStore } from "../../store/uiStore";
import { serverCommands, vaultCommands } from "../../lib/tauriCommands";
import { useVaultStore } from "../../store/vaultStore";
import { useSshKeyStore } from "../../store/sshKeyStore";
import { formatError } from "../../lib/errors";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import PortForwardsSection from "./PortForwardsSection";

interface EnvVar { key: string; value: string; }

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
  initialDir: string;
  preConnectHook: string;
  postDisconnectHook: string;
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
  initialDir: "",
  preConnectHook: "",
  postDisconnectHook: "",
};

type Tab = "connection" | "auth" | "advanced" | "tunnels";
type AdvancedTab = "organize" | "network" | "session" | "hooks";

const TABS: { id: Tab; label: string }[] = [
  { id: "connection", label: "Connection" },
  { id: "auth", label: "Auth" },
  { id: "advanced", label: "Advanced" },
  { id: "tunnels", label: "Tunnels" },
];

const ADVANCED_TABS: { id: AdvancedTab; label: string }[] = [
  { id: "organize", label: "Organize" },
  { id: "network", label: "Network" },
  { id: "session", label: "Session" },
  { id: "hooks", label: "Hooks" },
];

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

  const [activeTab, setActiveTab] = useState<Tab>("connection");
  const [activeAdvancedTab, setActiveAdvancedTab] = useState<AdvancedTab>("organize");
  const [form, setForm] = useState<FormData>(DEFAULT_FORM);
  const [password, setPassword] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [tags, setTags] = useState<Tag[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
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
      const parsedEnvVars: EnvVar[] = (() => {
        try { return existingServer.envVars ? JSON.parse(existingServer.envVars) : []; }
        catch { return []; }
      })();
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
        initialDir: existingServer.initialDir ?? "",
        preConnectHook: existingServer.preConnectHook ?? "",
        postDisconnectHook: existingServer.postDisconnectHook ?? "",
      });
      setEnvVars(parsedEnvVars);
      setTags(existingServer.tags);
    } else {
      setForm(DEFAULT_FORM);
      setEnvVars([]);
      setTags([]);
    }
    setErrors({});
    setTouched(new Set());
    setDirty(false);
    setTagInput("");
    setTagDropdownOpen(false);
    setShowNewGroup(false);
    setNewGroupName("");
    setActiveTab("connection");
    setActiveAdvancedTab("organize");
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
        await createTag(name);
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
    if (!validate()) {
      setActiveTab("connection");
      return;
    }

    setSubmitting(true);
    let freshCredentialId: string | undefined;
    try {
      let vaultCredentialId: string | undefined = isEdit
        ? existingServer?.vaultCredentialId
        : undefined;
      if (form.authMethod === "password" && password.trim()) {
        freshCredentialId = await vaultCommands.storeCredential(password.trim());
        vaultCredentialId = freshCredentialId;
      } else if (form.authMethod === "key" && passphrase.trim()) {
        freshCredentialId = await vaultCommands.storeCredential(passphrase.trim());
        vaultCredentialId = freshCredentialId;
      } else if (form.authMethod === "agent") {
        vaultCredentialId = undefined;
      }

      const validEnvVars = envVars.filter((v) => v.key.trim());
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
        initialDir: form.initialDir.trim() || undefined,
        envVars: validEnvVars.length > 0 ? JSON.stringify(validEnvVars) : undefined,
        preConnectHook: form.preConnectHook.trim() || undefined,
        postDisconnectHook: form.postDisconnectHook.trim() || undefined,
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

  const connectionHasError = !!(errors.displayName || errors.hostname || errors.port);

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

        {/* Tabs */}
        <div className="flex border-b border-stroke-subtle px-6 shrink-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.id
                  ? "border-accent text-white"
                  : "border-transparent text-muted hover:text-secondary"
              }`}
            >
              {tab.label}
              {tab.id === "connection" && connectionHasError && (
                <span className="size-1.5 rounded-full bg-error inline-block" />
              )}
            </button>
          ))}
        </div>

        {/* Form */}
        <form id="server-form" onSubmit={(e) => { void handleSubmit(e); }} className="overflow-y-auto flex-1 px-6 py-4 space-y-4">

          {/* ── Connection ── */}
          {activeTab === "connection" && (
            <>
              <Field label="Display Name" error={errors.displayName} required>
                <Input
                  id="displayName"
                  value={form.displayName}
                  onChange={set("displayName")}
                  onBlur={(e) => validateField("displayName", e.target.value)}
                  placeholder="Production Web Server"
                  aria-invalid={!!errors.displayName}
                  autoComplete="off"
                />
              </Field>

              <Field label="Hostname / IP" error={errors.hostname} required>
                <Input
                  id="hostname"
                  value={form.hostname}
                  onChange={set("hostname")}
                  onBlur={(e) => validateField("hostname", e.target.value)}
                  placeholder="web.example.com"
                  aria-invalid={!!errors.hostname}
                  autoComplete="off"
                />
              </Field>

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
                    aria-invalid={!!errors.port}
                    autoComplete="off"
                  />
                </Field>
                <Field label="Username">
                  <Input
                    id="username"
                    value={form.username}
                    onChange={set("username")}
                    placeholder="ubuntu"
                    autoComplete="off"
                  />
                </Field>
              </div>
            </>
          )}

          {/* ── Auth ── */}
          {activeTab === "auth" && (
            <>
              <Field label="Auth Method">
                <div className="flex h-10 rounded border border-stroke overflow-hidden">
                  {(["key", "password", "agent"] as const).map((method) => (
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
                      {method === "key" ? "SSH Key" : method === "password" ? "Password" : "SSH Agent"}
                    </button>
                  ))}
                </div>
                {form.authMethod === "agent" && (
                  <p className="mt-1.5 text-xs text-muted">
                    Uses your running ssh-agent. Run <code className="text-accent-fg">ssh-add</code> to load keys into the agent.
                  </p>
                )}
              </Field>

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

              {form.authMethod === "key" && (
                <Field label="Identity File">
                  {managedKeys.length > 0 && (
                    <Select
                      value={managedKeys.some((k) => k.keyPath === form.identityFilePath) ? form.identityFilePath : "__none__"}
                      onValueChange={(value) => {
                        if (value && value !== "__none__") {
                          setForm((f) => ({ ...f, identityFilePath: value }));
                          setDirty(true);
                        }
                      }}
                    >
                      <SelectTrigger className="w-full h-10 mb-2">
                        <SelectValue placeholder="— pick a managed key —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— pick a managed key —</SelectItem>
                        {managedKeys.map((k) => (
                          <SelectItem key={k.id} value={k.keyPath}>
                            {k.name} ({k.keyType.toUpperCase()})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <div className="relative">
                    <Input
                      id="identityFilePath"
                      value={form.identityFilePath}
                      onChange={set("identityFilePath")}
                      placeholder="~/.ssh/id_ed25519"
                      className="pr-9"
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      onClick={() => { void pickIdentityFile(); }}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 text-muted hover:text-white rounded transition-colors"
                      aria-label="Browse for identity file"
                    >
                      <FolderOpen className="size-4" />
                    </button>
                  </div>
                </Field>
              )}

              {form.authMethod === "key" && (
                <Field label={isEdit && existingServer?.vaultCredentialId ? "New Passphrase (leave blank to keep existing)" : "Passphrase (optional)"}>
                  {!vaultAvailable ? (
                    <p className="text-xs text-yellow-500">Unlock the vault to store a passphrase.</p>
                  ) : (
                    <Input
                      type="password"
                      value={passphrase}
                      onChange={(e) => setPassphrase(e.target.value)}
                      placeholder={isEdit && existingServer?.vaultCredentialId ? "Enter new passphrase to change…" : "Leave empty if the key has no passphrase"}
                      autoComplete="new-password"
                    />
                  )}
                </Field>
              )}
            </>
          )}

          {/* ── Advanced ── */}
          {activeTab === "advanced" && (
            <>
              {/* Sub-tab bar */}
              <div className="flex gap-1 p-1 bg-surface-2 rounded-lg shrink-0">
                {ADVANCED_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveAdvancedTab(tab.id)}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      activeAdvancedTab === tab.id
                        ? "bg-surface-4 text-white shadow-sm"
                        : "text-muted hover:text-secondary"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Organize — Group & Tags */}
              {activeAdvancedTab === "organize" && (
                <>
                  <Field label="Group" error={errors.group}>
                    {!showNewGroup ? (
                      <Select
                        value={form.groupId || "__none__"}
                        onValueChange={(value) => {
                          if (value === "__create_new__") {
                            setShowNewGroup(true);
                            setForm((f) => ({ ...f, groupId: "" }));
                          } else {
                            setShowNewGroup(false);
                            setForm((f) => ({ ...f, groupId: value && value !== "__none__" ? value : "" }));
                          }
                          setDirty(true);
                        }}
                      >
                        <SelectTrigger id="groupId" className="w-full h-10">
                          <SelectValue placeholder="No Group" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">No Group</SelectItem>
                          {groups.map((g) => (
                            <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                          ))}
                          <SelectItem value="__create_new__">＋ Create new group…</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex gap-2">
                        <Input
                          autoFocus
                          value={newGroupName}
                          onChange={(e) => setNewGroupName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleCreateGroup(); } }}
                          placeholder="Group name"
                          className="flex-1"
                          autoComplete="off"
                        />
                        <Button
                          type="button"
                          onClick={() => { void handleCreateGroup(); }}
                          className="px-3 shrink-0"
                        >
                          Add
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => { setShowNewGroup(false); setNewGroupName(""); }}
                          className="px-3 shrink-0"
                        >
                          Cancel
                        </Button>
                      </div>
                    )}
                  </Field>

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
                        autoComplete="off"
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
                </>
              )}

              {/* Network — Jump Host */}
              {activeAdvancedTab === "network" && (
                <>
                  <Field label="">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={form.isJumpHost}
                        onCheckedChange={(checked) => {
                          setForm((f) => ({ ...f, isJumpHost: checked === true }));
                          setDirty(true);
                        }}
                      />
                      <span className="text-sm text-secondary">This server is a jump host / bastion</span>
                    </label>
                  </Field>

                  {!form.isJumpHost && (
                    <Field label="Jump Through (optional)">
                      <Select
                        value={form.jumpHostId || "__none__"}
                        onValueChange={(value) => {
                          setForm((f) => ({ ...f, jumpHostId: value && value !== "__none__" ? value : "" }));
                          setDirty(true);
                        }}
                      >
                        <SelectTrigger id="jumpHostId" className="w-full h-10">
                          <SelectValue placeholder="Direct connection" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Direct connection</SelectItem>
                          {servers
                            .filter((s) => s.isJumpHost && s.id !== editingServerId)
                            .map((s) => (
                              <SelectItem key={s.id} value={s.id}>{s.displayName}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>

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
                                <span className={i === 0 || i === chain.length - 1 ? "text-muted" : "text-secondary font-medium"}>
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
                </>
              )}

              {/* Session — Initial Dir & Env Vars */}
              {activeAdvancedTab === "session" && (
                <>
                  <Field label="Initial Directory">
                    <Input
                      id="initialDir"
                      value={form.initialDir}
                      onChange={set("initialDir")}
                      placeholder="/var/www/html"
                      autoComplete="off"
                    />
                    <p className="mt-1 text-xs text-muted">
                      Shell will <code className="text-accent-fg">cd</code> here immediately after connecting.
                    </p>
                  </Field>

                  <div>
                    <label className="block text-sm font-medium text-secondary mb-1">
                      Environment Variables
                    </label>
                    <p className="text-xs text-muted mb-2">
                      Exported to the shell immediately after connecting.
                    </p>
                    <div className="space-y-1.5">
                      {envVars.map((v, i) => (
                        <div key={i} className="flex gap-1.5 items-center">
                          <Input
                            value={v.key}
                            onChange={(e) => setEnvVars((prev) => prev.map((ev, j) => j === i ? { ...ev, key: e.target.value } : ev))}
                            placeholder="KEY"
                            className="w-32 shrink-0 font-mono text-xs h-8"
                            autoComplete="off"
                            spellCheck={false}
                          />
                          <span className="text-dim text-xs shrink-0">=</span>
                          <Input
                            value={v.value}
                            onChange={(e) => setEnvVars((prev) => prev.map((ev, j) => j === i ? { ...ev, value: e.target.value } : ev))}
                            placeholder="value"
                            className="flex-1 font-mono text-xs h-8"
                            autoComplete="off"
                            spellCheck={false}
                          />
                          <button
                            type="button"
                            onClick={() => setEnvVars((prev) => prev.filter((_, j) => j !== i))}
                            className="text-dim hover:text-red-400 transition-colors shrink-0 text-sm leading-none px-1"
                            title="Remove"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setEnvVars((prev) => [...prev, { key: "", value: "" }])}
                        className="h-7 text-xs px-3 mt-1"
                      >
                        + Add variable
                      </Button>
                    </div>
                  </div>
                </>
              )}

              {/* Hooks — Pre/Post connection scripts */}
              {activeAdvancedTab === "hooks" && (
                <>
                  <Field label="Pre-connect Hook">
                    <textarea
                      value={form.preConnectHook}
                      onChange={set("preConnectHook")}
                      placeholder={"#!/bin/sh\n# Runs locally before connecting\naws sso login --profile prod"}
                      rows={4}
                      spellCheck={false}
                      className="w-full rounded-md border border-stroke bg-surface-2 px-3 py-2 text-xs font-mono text-white placeholder-[#555] focus:outline-none focus:ring-1 focus:ring-accent resize-none"
                    />
                    <p className="mt-1 text-xs text-muted">
                      Runs locally before the SSH connection. Non-zero exit cancels the connection.
                      Env: <code className="text-accent-fg">SSHELTER_HOST</code>, <code className="text-accent-fg">SSHELTER_PORT</code>, <code className="text-accent-fg">SSHELTER_USER</code>.
                    </p>
                  </Field>

                  <Field label="Post-disconnect Hook">
                    <textarea
                      value={form.postDisconnectHook}
                      onChange={set("postDisconnectHook")}
                      placeholder={"#!/bin/sh\n# Runs locally after session ends\nnotify-send \"Disconnected from $SSHELTER_HOST\""}
                      rows={4}
                      spellCheck={false}
                      className="w-full rounded-md border border-stroke bg-surface-2 px-3 py-2 text-xs font-mono text-white placeholder-[#555] focus:outline-none focus:ring-1 focus:ring-accent resize-none"
                    />
                    <p className="mt-1 text-xs text-muted">
                      Runs locally after disconnect. Spawned in the background — does not block cleanup.
                    </p>
                  </Field>
                </>
              )}
            </>
          )}

          {/* ── Tunnels ── */}
          {activeTab === "tunnels" && (
            isEdit && editingServerId
              ? <PortForwardsSection serverId={editingServerId} />
              : <p className="text-meta text-faint px-1">Port forwards can be configured after saving the server.</p>
          )}

        </form>

        {/* Footer */}
        <div className="px-6 pt-3 pb-4 border-t border-stroke-subtle shrink-0">
          {errors.submit && (
            <p className="text-sm text-error bg-error-subtle border border-error-subtle rounded-md px-3 py-2 mb-3">
              {errors.submit}
            </p>
          )}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" form="server-form" disabled={submitting}>
              {saved ? "Saved ✓" : submitting ? "Saving…" : isEdit ? "Save Changes" : "Add Server"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────────

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
