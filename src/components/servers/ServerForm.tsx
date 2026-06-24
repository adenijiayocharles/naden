import { useState, useEffect, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { homeDir, join } from "@tauri-apps/api/path";
import type { AuthMethod, Tag } from "../../types/server";
import type { TerminalThemeId } from "../../lib/terminalSettings";
import { useServerStore } from "../../store/serverStore";
import { useUiStore } from "../../store/uiStore";
import { useTunnelStore } from "../../store/tunnelStore";
import { vaultCommands } from "../../lib/tauriCommands";
import { useVaultStore } from "../../store/vaultStore";
import { useSshKeyStore } from "../../store/sshKeyStore";
import { formatError } from "../../lib/errors";
import { Button } from "../ui/button";
import PortForwardsSection from "./PortForwardsSection";
import type { FormData, EnvVar, DraftPortForward } from "./serverFormTypes";
import { ConnectionTab } from "./tabs/ConnectionTab";
import { AuthTab } from "./tabs/AuthTab";
import { ThemeTab } from "./tabs/ThemeTab";
import { OrganizeTab } from "./tabs/OrganizeTab";
import { NetworkTab } from "./tabs/NetworkTab";
import { SessionTab } from "./tabs/SessionTab";
import { HooksTab } from "./tabs/HooksTab";

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
  terminalTheme: "",
};

type Tab = "connection" | "auth" | "theme" | "organize" | "network" | "session" | "hooks" | "tunnels";

const TABS: { id: Tab; label: string }[] = [
  { id: "connection", label: "Connection" },
  { id: "auth", label: "Auth" },
  { id: "theme", label: "Theme" },
  { id: "organize", label: "Organize" },
  { id: "network", label: "Network" },
  { id: "session", label: "Session" },
  { id: "hooks", label: "Hooks" },
  { id: "tunnels", label: "Tunnels" },
];

export default function ServerForm() {
  const activeView = useUiStore((s) => s.activeView);
  const editingServerId = useUiStore((s) => s.editingServerId);
  const closeForm = useUiStore((s) => s.closeForm);
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

  // Once an "Add Server" submit succeeds, the row exists even though the
  // modal is still in "add" mode (it no longer auto-closes). These track
  // that so the rest of the form treats further saves as edits rather than
  // creating duplicate servers.
  const [createdServerId, setCreatedServerId] = useState<string | null>(null);
  const [createdServerCredentialId, setCreatedServerCredentialId] = useState<string | undefined>(undefined);
  const effectiveServerId = isEdit ? editingServerId : createdServerId;
  const effectiveIsEdit = isEdit || createdServerId !== null;
  const effectiveCredentialId = isEdit ? existingServer?.vaultCredentialId : createdServerCredentialId;

  const isVaultUnlocked = useVaultStore((s) => s.isUnlocked);
  const isPasswordRequired = useVaultStore((s) => s.isPasswordRequired);
  const vaultAvailable = !isPasswordRequired || isVaultUnlocked;

  const managedKeys = useSshKeyStore((s) => s.keys);
  const loadKeys = useSshKeyStore((s) => s.load);
  useEffect(() => { void loadKeys(); }, [loadKeys]);

  const [activeTab, setActiveTab] = useState<Tab>("connection");
  const [form, setForm] = useState<FormData>(DEFAULT_FORM);
  const [password, setPassword] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [tags, setTags] = useState<Tag[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [draftForwards, setDraftForwards] = useState<DraftPortForward[]>([]);
  const createTunnel = useTunnelStore((s) => s.create);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [, setTouched] = useState<Set<keyof FormData>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showSavedBanner, setShowSavedBanner] = useState(false);
  const [lastSaveWasCreate, setLastSaveWasCreate] = useState(false);
  const savedBannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dirty, setDirty] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const tagDropdownRef = useRef<HTMLDivElement>(null);
  const allTags = useServerStore((s) => s.tags);

  const clearSavedBannerTimer = () => {
    if (savedBannerTimer.current) clearTimeout(savedBannerTimer.current);
  };

  const flashSavedBanner = () => {
    setShowSavedBanner(true);
    clearSavedBannerTimer();
    savedBannerTimer.current = setTimeout(() => setShowSavedBanner(false), 2500);
  };

  useEffect(() => clearSavedBannerTimer, []);

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
        terminalTheme: (existingServer.terminalTheme ?? "") as TerminalThemeId | "",
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
    setSaved(false);
    setShowSavedBanner(false);
    clearSavedBannerTimer();
    setDraftForwards([]);
    setCreatedServerId(null);
    setCreatedServerCredentialId(undefined);
    setLastSaveWasCreate(false);
    setPassword("");
    setPassphrase("");
    // existingServer is intentionally excluded: the modal stays open after a
    // successful save, and re-syncing here would reset the active tab and
    // discard in-progress edits every time the store updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingServerId, activeView]);

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
      const tag = await createTag(name);
      setTags((ts) => (ts.some((t) => t.id === tag.id) ? ts : [...ts, tag]));
      setTagInput("");
      setDirty(true);
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
      const previousCredentialId = effectiveCredentialId;
      let vaultCredentialId: string | undefined = effectiveIsEdit
        ? effectiveCredentialId
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
        terminalTheme: form.terminalTheme || undefined,
        tagIds: tags.map((t) => t.id),
      };

      let newServerId: string | undefined;
      if (effectiveIsEdit && effectiveServerId) {
        await updateServer(effectiveServerId, payload);
      } else {
        const server = await createServer(payload);
        newServerId = server.id;
        setCreatedServerId(server.id);
      }
      setLastSaveWasCreate(!!newServerId);
      // Deliberately keyed on isEdit, not effectiveIsEdit: this needs to keep
      // tracking the latest credential on every save made within an Add-session
      // (including the second, third, ... save after the row already exists),
      // whereas effectiveIsEdit would flip true after the first create and stop
      // updating it.
      if (!isEdit) setCreatedServerCredentialId(vaultCredentialId);

      // The previous credential (if any) has just been replaced by vaultCredentialId
      // above — delete it so it doesn't linger in the vault unreferenced.
      if (previousCredentialId && previousCredentialId !== vaultCredentialId) {
        vaultCommands.deleteCredential(previousCredentialId).catch(() => {});
      }

      let tunnelFailures = 0;
      if (newServerId && draftForwards.length > 0) {
        const results = await Promise.allSettled(
          draftForwards.map((draft) =>
            createTunnel({
              serverId: newServerId,
              label: draft.label,
              forwardType: draft.forwardType,
              localPort: draft.localPort,
              remoteHost: draft.remoteHost,
              remotePort: draft.remotePort,
              autoStart: draft.autoStart,
            }),
          ),
        );
        tunnelFailures = results.filter((r) => r.status === "rejected").length;
        setDraftForwards([]);
      }

      setSaved(true);
      setDirty(false);
      setPassword("");
      setPassphrase("");
      if (tunnelFailures > 0) {
        setErrors((errs) => ({
          ...errs,
          submit: `Server saved, but ${tunnelFailures} port forward${tunnelFailures > 1 ? "s" : ""} failed to create. Add ${tunnelFailures > 1 ? "them" : "it"} again from the Tunnels tab.`,
        }));
      } else {
        flashSavedBanner();
        setErrors((errs) => { const next = { ...errs }; delete next.submit; return next; });
      }
    } catch (e) {
      // Clean up the freshly-stored credential if the server row was never created.
      if (freshCredentialId) {
        vaultCommands.deleteCredential(freshCredentialId).catch(() => {});
      }
      setSaved(false);
      setShowSavedBanner(false);
      clearSavedBannerTimer();
      setErrors((errs) => ({ ...errs, submit: formatError(e) }));
    } finally {
      setSubmitting(false);
    }
  };

  const connectionHasError = !!(errors.displayName || errors.hostname || errors.port);

  return (
    <div className="fixed inset-0 bg-black/85 animate-backdrop-in z-50 overflow-y-auto" onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="flex min-h-full items-center justify-center p-8" onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="bg-surface-1 border border-stroke-subtle rounded-xl shadow-overlay animate-overlay-in w-full max-w-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stroke-subtle shrink-0">
          <h2 className="text-lg font-semibold text-white">
            {effectiveIsEdit ? "Edit Server" : "Add Server"}
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
              {tab.id === "tunnels" && !effectiveServerId && draftForwards.length > 0 && (
                <span className="min-w-3.5 h-3.5 px-1 rounded-full bg-accent text-black text-[10px] font-semibold leading-3.5 inline-block text-center">
                  {draftForwards.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Form */}
        <form id="server-form" onSubmit={(e) => { void handleSubmit(e); }} className="px-6 py-4 space-y-4">
          {activeTab === "connection" && (
            <ConnectionTab form={form} set={set} errors={errors} validateField={validateField} />
          )}
          {activeTab === "auth" && (
            <AuthTab
              form={form}
              set={set}
              setForm={setForm}
              setDirty={setDirty}
              password={password}
              setPassword={setPassword}
              passphrase={passphrase}
              setPassphrase={setPassphrase}
              isEdit={effectiveIsEdit}
              existingCredentialId={effectiveCredentialId}
              vaultAvailable={vaultAvailable}
              managedKeys={managedKeys}
              pickIdentityFile={pickIdentityFile}
            />
          )}
          {activeTab === "theme" && (
            <ThemeTab form={form} setForm={setForm} setDirty={setDirty} />
          )}
          {activeTab === "organize" && (
            <OrganizeTab
              form={form}
              setForm={setForm}
              setDirty={setDirty}
              errors={errors}
              tags={tags}
              setTags={setTags}
              tagInput={tagInput}
              setTagInput={setTagInput}
              tagDropdownOpen={tagDropdownOpen}
              setTagDropdownOpen={setTagDropdownOpen}
              tagSuggestions={tagSuggestions}
              tagInputRef={tagInputRef}
              tagDropdownRef={tagDropdownRef}
              handleTagKeyDown={handleTagKeyDown}
              groups={groups}
              newGroupName={newGroupName}
              setNewGroupName={setNewGroupName}
              showNewGroup={showNewGroup}
              setShowNewGroup={setShowNewGroup}
              handleCreateGroup={handleCreateGroup}
            />
          )}
          {activeTab === "network" && (
            <NetworkTab
              form={form}
              setForm={setForm}
              setDirty={setDirty}
              servers={servers}
              editingServerId={effectiveServerId}
            />
          )}
          {activeTab === "session" && (
            <SessionTab form={form} set={set} envVars={envVars} setEnvVars={setEnvVars} setDirty={setDirty} />
          )}
          {activeTab === "hooks" && (
            <HooksTab form={form} set={set} />
          )}
          {activeTab === "tunnels" && (
            effectiveServerId
              ? <PortForwardsSection key={effectiveServerId} serverId={effectiveServerId} />
              : <PortForwardsSection key="draft" draftForwards={draftForwards} onDraftForwardsChange={setDraftForwards} />
          )}
        </form>

        {/* Footer */}
        <div className="px-6 pt-3 pb-4 border-t border-stroke-subtle shrink-0">
          {errors.submit && (
            <p className="text-sm text-error bg-error-subtle border border-error-subtle rounded-md px-3 py-2 mb-3">
              {errors.submit}
            </p>
          )}
          {showSavedBanner && !dirty && !errors.submit && (
            <p className="text-sm text-success bg-success-subtle border border-success-subtle rounded-md px-3 py-2 mb-3">
              {lastSaveWasCreate ? "Server added." : "Changes saved."}
            </p>
          )}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" size="lg" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" form="server-form" size="lg" disabled={submitting || (saved && !dirty)}>
              {submitting ? "Saving…" : saved && !dirty && !errors.submit ? "Saved ✓" : effectiveIsEdit ? "Save Changes" : "Add Server"}
            </Button>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
