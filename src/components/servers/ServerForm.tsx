import { useState, useEffect, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { homeDir, join } from "@tauri-apps/api/path";
import type { AuthMethod, Tag } from "../../types/server";
import { useServerStore } from "../../store/serverStore";
import { useUiStore } from "../../store/uiStore";
import { serverCommands } from "../../lib/tauriCommands";
import { formatError } from "../../lib/errors";

interface FormData {
  displayName: string;
  hostname: string;
  port: number;
  username: string;
  authMethod: AuthMethod;
  identityFilePath: string;
  groupId: string;
  notes: string;
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
  notes: "",
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

  const [form, setForm] = useState<FormData>(DEFAULT_FORM);
  const [tags, setTags] = useState<Tag[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);

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
        notes: existingServer.notes ?? "",
        isJumpHost: existingServer.isJumpHost,
        jumpHostId: existingServer.jumpHostId ?? "",
      });
      setTags(existingServer.tags);
    } else {
      setForm(DEFAULT_FORM);
      setTags([]);
    }
    setErrors({});
    setTagInput("");
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
      setErrors((errs) => { const next = { ...errs }; delete next[field]; return next; });
    };

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
    try {
      const payload = {
        displayName: form.displayName.trim(),
        hostname: form.hostname.trim(),
        port: form.port,
        username: form.username.trim() || undefined,
        authMethod: form.authMethod,
        identityFilePath: form.identityFilePath.trim() || undefined,
        groupId: form.groupId || undefined,
        notes: form.notes.trim() || undefined,
        isJumpHost: form.isJumpHost,
        jumpHostId: form.jumpHostId || undefined,
        tagIds: tags.map((t) => t.id),
      };

      if (isEdit && editingServerId) {
        await updateServer(editingServerId, payload);
      } else {
        await createServer(payload);
      }
      closeForm();
    } catch (e) {
      setErrors((errs) => ({ ...errs, submit: formatError(e) }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) closeForm(); }}
    >
      <div className="bg-[#111] border border-[#1e1e1e] rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e1e1e] shrink-0">
          <h2 className="text-lg font-semibold text-white">
            {isEdit ? "Edit Server" : "Add Server"}
          </h2>
          <button
            onClick={closeForm}
            className="text-[#777] hover:text-white p-1 rounded"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={(e) => { void handleSubmit(e); }} className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {/* Display Name */}
          <Field label="Display Name" error={errors.displayName} required>
            <input
              id="displayName"
              value={form.displayName}
              onChange={set("displayName")}
              placeholder="Production Web Server"
              className={input(!!errors.displayName)}
            />
          </Field>

          {/* Hostname */}
          <Field label="Hostname / IP" error={errors.hostname} required>
            <input
              id="hostname"
              value={form.hostname}
              onChange={set("hostname")}
              placeholder="web.example.com"
              className={input(!!errors.hostname)}
            />
          </Field>

          {/* Port + Username */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Port" error={errors.port} required>
              <input
                id="port"
                type="number"
                min={1}
                max={65535}
                value={form.port}
                onChange={set("port")}
                className={input(!!errors.port)}
              />
            </Field>
            <Field label="Username">
              <input
                id="username"
                value={form.username}
                onChange={set("username")}
                placeholder="ubuntu"
                className={input(false)}
              />
            </Field>
          </div>

          {/* Auth Method */}
          <Field label="Auth Method">
            <SelectWrapper>
              <select
                id="authMethod"
                value={form.authMethod}
                onChange={set("authMethod")}
                className={select()}
              >
                <option value="key">SSH Key</option>
                <option value="password">Password</option>
                <option value="agent">SSH Agent</option>
              </select>
            </SelectWrapper>
          </Field>

          {/* Identity File */}
          {form.authMethod === "key" && (
            <Field label="Identity File">
              <div className="flex gap-2">
                <input
                  id="identityFilePath"
                  value={form.identityFilePath}
                  onChange={set("identityFilePath")}
                  placeholder="~/.ssh/id_ed25519"
                  className={`${input(false)} flex-1`}
                />
                <button
                  type="button"
                  onClick={() => { void pickIdentityFile(); }}
                  className="px-3 py-2 bg-[#1a1a1a] hover:bg-[#222] text-[#bbb] text-sm rounded border border-[#2a2a2a] transition-colors shrink-0"
                >
                  Browse
                </button>
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
                <input
                  autoFocus
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleCreateGroup(); } }}
                  placeholder="Group name"
                  className={`${input(false)} flex-1`}
                />
                <button
                  type="button"
                  onClick={() => { void handleCreateGroup(); }}
                  className="px-3 py-2 bg-accent hover:bg-accent-hover text-black text-sm rounded font-semibold transition-colors shrink-0"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => { setShowNewGroup(false); setNewGroupName(""); }}
                  className="px-3 py-2 bg-[#1a1a1a] hover:bg-[#222] text-[#bbb] text-sm rounded transition-colors shrink-0"
                >
                  Cancel
                </button>
              </div>
            )}
          </Field>

          {/* Tags */}
          <Field label="Tags" error={errors.tag}>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {tags.map((t) => (
                  <span key={t.id} className="flex items-center gap-1 bg-[#1a1a1a] border border-[#2a2a2a] text-[#999] text-xs px-2 py-1 rounded-full">
                    #{t.name}
                    <button
                      type="button"
                      onClick={() => setTags((ts) => ts.filter((x) => x.id !== t.id))}
                      className="text-[#777] hover:text-white leading-none"
                      aria-label={`Remove tag ${t.name}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <input
              ref={tagInputRef}
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              placeholder="Type a tag and press Enter"
              className={input(false)}
            />
          </Field>

          {/* Jump Host */}
          <Field label="">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isJumpHost}
                onChange={set("isJumpHost")}
                className="rounded border-[#2a2a2a] bg-[#1a1a1a] text-accent"
              />
              <span className="text-sm text-[#bbb]">This server is a jump host / bastion</span>
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
                  <div className="mt-2 flex items-center flex-wrap gap-1 text-xs text-[#666]">
                    {chain.map((label, i) => (
                      <span key={i} className="flex items-center gap-1">
                        <span className={i === 0 || i === chain.length - 1
                          ? "text-[#888]"
                          : "text-accent font-medium"}>
                          {label}
                        </span>
                        {i < chain.length - 1 && <span className="text-[#333]">→</span>}
                      </span>
                    ))}
                  </div>
                );
              })()}
            </Field>
          )}

          {/* Notes */}
          <Field label="Notes">
            <textarea
              id="notes"
              value={form.notes}
              onChange={set("notes")}
              rows={2}
              placeholder="Optional notes about this server…"
              className={`${input(false)} resize-none`}
            />
          </Field>

          {errors.submit && (
            <p className="text-sm text-red-400 bg-red-950 border border-red-800 rounded-md px-3 py-2">
              {errors.submit}
            </p>
          )}
        </form>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[#1e1e1e] shrink-0">
          <button
            type="button"
            onClick={closeForm}
            className="px-4 py-2 text-sm text-[#777] hover:text-white bg-[#1a1a1a] hover:bg-[#222] rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={(e) => { void handleSubmit(e as unknown as React.FormEvent); }}
            disabled={submitting}
            className="px-4 py-2 text-sm text-black bg-accent hover:bg-accent-hover rounded font-semibold transition-colors disabled:opacity-50"
          >
            {submitting ? "Saving…" : isEdit ? "Save Changes" : "Add Server"}
          </button>
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
        <label className="block text-sm font-medium text-[#bbb] mb-1">
          {label}
          {required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
      )}
      {children}
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}

function SelectWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      {children}
      <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[#777]">
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </div>
    </div>
  );
}

const input = (hasError: boolean) =>
  `w-full bg-[#1a1a1a] border ${hasError ? "border-red-500" : "border-[#2a2a2a]"} rounded px-3 py-2 text-sm text-white placeholder-[#666] focus:outline-none focus:border-accent transition-colors`;

const select = () =>
  "w-full appearance-none bg-[#1a1a1a] border border-[#2a2a2a] rounded px-3 pr-10 py-2 text-sm text-white focus:outline-none focus:border-accent transition-colors";
