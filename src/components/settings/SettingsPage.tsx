import { useState, useEffect, useRef, useCallback } from "react";
import { getVersion } from "@tauri-apps/api/app";
import Input from "../shared/Input";
import Button from "../shared/Button";
import ConfirmDeleteModal from "../shared/ConfirmDeleteModal";
import { useVaultStore } from "../../store/vaultStore";
import { useUiStore, type SettingsSection } from "../../store/uiStore";
import { useTerminalSettings, TERMINAL_FONTS, TERMINAL_THEMES, fontCss } from "../../lib/terminalSettings";
import { settingsCommands, assistantCommands, updaterCommands, type AssistantStatus, type UpdateInfo } from "../../lib/tauriCommands";
import { formatError } from "../../lib/errors";
import { passwordStrength } from "../../lib/passwordStrength";

type Section = SettingsSection;

type ActiveForm = "none" | "disable" | "enable" | "change";

function PasswordInput({
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  return (
    <Input
      autoFocus={autoFocus}
      type="password"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  );
}

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-6 pb-4 border-b border-stroke-subtle">
      <h2 className="text-base font-semibold text-white">{title}</h2>
      {description && <p className="text-sm text-muted mt-0.5">{description}</p>}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-stroke-subtle last:border-b-0">
      {children}
    </div>
  );
}

function RowLabel({ title, description }: { title: string; description?: string }) {
  return (
    <div className="min-w-0 mr-6">
      <p className="text-sm text-white font-medium">{title}</p>
      {description && <p className="text-meta text-muted mt-0.5">{description}</p>}
    </div>
  );
}

const NAV_ITEMS: { id: Section; label: string; icon: React.ReactNode }[] = [
  {
    id: "appearance",
    label: "Appearance",
    icon: (
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
      </svg>
    ),
  },
  {
    id: "security",
    label: "Security",
    icon: (
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
  {
    id: "terminal",
    label: "Terminal",
    icon: (
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
      </svg>
    ),
  },
  {
    id: "assistant",
    label: "AI Assistant",
    icon: (
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    id: "about",
    label: "About",
    icon: (
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    ),
  },
];

export default function SettingsPage() {
  const settingsSection = useUiStore((s) => s.settingsSection);
  const [activeSection, setActiveSection] = useState<Section>(settingsSection);

  useEffect(() => {
    setActiveSection(settingsSection);
  }, [settingsSection]);

  const {
    isPasswordRequired,
    disablePassword,
    enablePassword,
    changePassword,
  } = useVaultStore();
  const setVaultTimeoutMins = useUiStore((s) => s.setVaultTimeoutMins);
  const { fontSize, lineHeight, scrollback, copyOnSelect, fontFamily, termTheme, setFontSize, setLineHeight, setScrollback, setCopyOnSelect, setFontFamily, setTermTheme } =
    useTerminalSettings();

  const [activeForm, setActiveForm] = useState<ActiveForm>("none");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashSaved = useCallback(() => {
    setSavedFlash(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSavedFlash(false), 2000);
  }, []);

  // About / Updates
  const [appVersion, setAppVersion] = useState("");
  const [updateState, setUpdateState] = useState<"idle" | "checking" | "up-to-date" | "available" | "downloading" | "ready" | "error">("idle");
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {});
  }, []);

  const checkForUpdates = useCallback(async () => {
    setUpdateState("checking");
    setUpdateError(null);
    try {
      const update = await updaterCommands.checkForUpdate();
      if (update) {
        setUpdateInfo(update);
        setUpdateState("available");
      } else {
        setUpdateState("up-to-date");
      }
    } catch (e) {
      setUpdateError(formatError(e));
      setUpdateState("error");
    }
  }, []);

  const installUpdate = useCallback(async () => {
    if (!updateInfo) return;
    setUpdateState("downloading");
    setUpdateError(null);
    try {
      await updateInfo.download();
      setUpdateState("ready");
    } catch (e) {
      setUpdateError(formatError(e));
      setUpdateState("error");
    }
  }, [updateInfo]);

  // AI Assistant
  const [assistantStatus, setAssistantStatus] = useState<AssistantStatus | null>(null);
  const [addingProvider, setAddingProvider] = useState<"openai" | "anthropic" | null>(null);
  const [addKeyInput, setAddKeyInput] = useState("");
  const [confirmForgetProvider, setConfirmForgetProvider] = useState<"openai" | "anthropic" | null>(null);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [assistantLoading, setAssistantLoading] = useState(false);
  useEffect(() => {
    assistantCommands.getStatus().then(setAssistantStatus).catch(() => {});
  }, []);
  const submitAddKey = async (provider: "openai" | "anthropic") => {
    setAssistantLoading(true);
    setAssistantError(null);
    try {
      await assistantCommands.setApiKey(provider, addKeyInput);
      if (!assistantStatus?.openaiConfigured && !assistantStatus?.anthropicConfigured) {
        await assistantCommands.setEnabled(true);
      }
      setAssistantStatus(await assistantCommands.getStatus());
      setAddKeyInput("");
      setAddingProvider(null);
      flashSaved();
    } catch (e) {
      setAssistantError(formatError(e));
    } finally {
      setAssistantLoading(false);
    }
  };
  const forgetProviderKey = async (provider: "openai" | "anthropic") => {
    setAssistantLoading(true);
    setAssistantError(null);
    try {
      await assistantCommands.clearProviderKey(provider);
      setAssistantStatus(await assistantCommands.getStatus());
      flashSaved();
    } catch (e) {
      setAssistantError(formatError(e));
    } finally {
      setAssistantLoading(false);
    }
  };
  const switchToProvider = async (provider: string) => {
    setAssistantStatus((s) => (s ? { ...s, activeProvider: provider } : s));
    await assistantCommands.switchProvider(provider).catch(() => {});
    flashSaved();
  };
  const toggleAssistantEnabled = async (enabled: boolean) => {
    setAssistantStatus((s) => (s ? { ...s, enabled } : s));
    await assistantCommands.setEnabled(enabled).catch(() => {});
    flashSaved();
  };
  const toggleAssistantPersistHistory = async (persistHistory: boolean) => {
    setAssistantStatus((s) => (s ? { ...s, persistHistory } : s));
    await assistantCommands.setPersistHistory(persistHistory).catch(() => {});
    flashSaved();
  };

  // Theme
  type Theme = "dark" | "oled" | "dim" | "light";
  const [theme, setTheme] = useState<Theme>("dark");
  useEffect(() => {
    settingsCommands.getSetting("theme")
      .then((v) => { if (v) setTheme(v as Theme); })
      .catch(() => {});
  }, []);
  const saveTheme = (t: Theme) => {
    setTheme(t);
    document.documentElement.dataset.theme = t === "dark" ? "" : t;
    settingsCommands.setSetting("theme", t).catch(() => {});
    flashSaved();
  };

  // Accent colour
  const ACCENTS = [
    { id: "lime",   base: "#CDFF00", hover: "#d8ff33", dim: "#a8cc00" },
    { id: "green",  base: "#00e676", hover: "#33eb91", dim: "#00b85e" },
    { id: "cyan",   base: "#00d4ff", hover: "#33ddff", dim: "#00a8cc" },
    { id: "blue",   base: "#4f8ef7", hover: "#7aaeff", dim: "#3a6bc4" },
    { id: "purple", base: "#a78bfa", hover: "#c4b0ff", dim: "#7c5ccc" },
    { id: "orange", base: "#ff8c42", hover: "#ffa566", dim: "#cc6f35" },
    { id: "pink",   base: "#f472b6", hover: "#f9a8d4", dim: "#c4588c" },
    { id: "red",    base: "#ff5555", hover: "#ff7777", dim: "#cc4444" },
    { id: "white",  base: "#ffffff", hover: "#eeeeee", dim: "#cccccc" },
  ] as const;
  type AccentId = typeof ACCENTS[number]["id"];
  const [accentId, setAccentId] = useState<AccentId>("lime");
  useEffect(() => {
    settingsCommands.getSetting("accent")
      .then((v) => { if (v) setAccentId(v as AccentId); })
      .catch(() => {});
  }, []);
  const saveAccent = (id: AccentId) => {
    const a = ACCENTS.find((x) => x.id === id)!;
    setAccentId(id);
    const root = document.documentElement;
    root.style.setProperty("--color-accent", a.base);
    root.style.setProperty("--color-accent-hover", a.hover);
    root.style.setProperty("--color-accent-dim", a.dim);
    settingsCommands.setSetting("accent", id).catch(() => {});
    flashSaved();
  };

  // Vault timeout
  const [timeoutMins, setTimeoutMins] = useState("0");
  useEffect(() => {
    settingsCommands.getSetting("vault_timeout_minutes")
      .then((v) => {
        if (v !== null) {
          setTimeoutMins(v);
          setVaultTimeoutMins(Number(v));
        }
      })
      .catch(() => {});
  }, [setVaultTimeoutMins]);
  const [autoLockNeedsPassword, setAutoLockNeedsPassword] = useState(false);
  const saveTimeout = (v: string) => {
    if (v !== "0" && !isPasswordRequired) {
      setAutoLockNeedsPassword(true);
      return;
    }
    setAutoLockNeedsPassword(false);
    setTimeoutMins(v);
    setVaultTimeoutMins(Number(v));
    settingsCommands.setSetting("vault_timeout_minutes", v).catch(() => {});
    flashSaved();
  };

  // SSH keepalive
  const [keepaliveInterval, setKeepaliveInterval] = useState("0");
  useEffect(() => {
    settingsCommands.getSetting("ssh_keepalive_interval")
      .then((v) => { if (v !== null) setKeepaliveInterval(v); })
      .catch(() => {});
  }, []);
  const saveKeepalive = (v: string) => {
    setKeepaliveInterval(v);
    settingsCommands.setSetting("ssh_keepalive_interval", v).catch(() => {});
    flashSaved();
  };

  // Vault forms
  const [disablePwd, setDisablePwd] = useState("");
  const [enablePwd, setEnablePwd] = useState("");
  const [enableConfirm, setEnableConfirm] = useState("");
  const [changeCurrent, setChangeCurrent] = useState("");
  const [changeNew, setChangeNew] = useState("");
  const [changeConfirm, setChangeConfirm] = useState("");

  const reset = () => {
    setError(null); setSuccess(null);
    setDisablePwd(""); setEnablePwd(""); setEnableConfirm("");
    setChangeCurrent(""); setChangeNew(""); setChangeConfirm("");
  };
  const openForm = (form: ActiveForm) => { reset(); setActiveForm(form); };

  const handleToggle = () => {
    if (isPasswordRequired) {
      openForm(activeForm === "disable" ? "none" : "disable");
    } else {
      openForm(activeForm === "enable" ? "none" : "enable");
    }
  };

  const submitDisable = async () => {
    setLoading(true); setError(null);
    try {
      await disablePassword(disablePwd);
      setSuccess("Vault password disabled.");
      setActiveForm("none"); setDisablePwd("");
    } catch (e) { setError(formatError(e)); }
    finally { setLoading(false); }
  };

  const submitEnable = async () => {
    if (enablePwd !== enableConfirm) { setError("Passwords do not match."); return; }
    if (enablePwd.length < 8) { setError("Password must be at least 8 characters."); return; }
    setLoading(true); setError(null);
    try {
      await enablePassword(enablePwd);
      setSuccess("Vault password enabled.");
      setActiveForm("none"); setEnablePwd(""); setEnableConfirm("");
      setAutoLockNeedsPassword(false);
    } catch (e) { setError(formatError(e)); }
    finally { setLoading(false); }
  };

  const submitChange = async () => {
    if (changeNew !== changeConfirm) { setError("New passwords do not match."); return; }
    if (changeNew.length < 8) { setError("New password must be at least 8 characters."); return; }
    setLoading(true); setError(null);
    try {
      await changePassword(changeCurrent, changeNew);
      setSuccess("Master password changed.");
      setActiveForm("none"); setChangeCurrent(""); setChangeNew(""); setChangeConfirm("");
    } catch (e) { setError(formatError(e)); }
    finally { setLoading(false); }
  };

  const { label: strengthLabel, color: strengthColor, pct: strengthPct } =
    passwordStrength(activeForm === "enable" ? enablePwd : changeNew);

  return (
    <div className="flex h-full overflow-hidden bg-surface-1">
      {/* Left nav */}
      <nav className="w-52 shrink-0 border-r border-stroke-subtle bg-surface-0 flex flex-col p-3">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider px-3 mb-3 mt-1">Settings</p>
        <div className="flex flex-col gap-0.5 flex-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`flex items-center gap-2.5 px-3 py-2 rounded text-sm text-left transition-colors w-full ${
                activeSection === item.id
                  ? "bg-accent/15 text-accent-fg"
                  : "text-secondary hover:text-white hover:bg-surface-2"
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
        <div className="px-3 pb-1 h-5">
          <span
            className={`text-xs text-success transition-opacity duration-300 ${savedFlash ? "opacity-100" : "opacity-0"}`}
            aria-live="polite"
          >
            ✓ Saved
          </span>
        </div>
      </nav>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-8 py-8">

          {/* ── Appearance ── */}
          {activeSection === "appearance" && (
            <div>
              <SectionHeader title="Appearance" />

              <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Theme</p>
              <div className="flex gap-2 mb-6">
                {([
                  { id: "dark",  label: "Dark",  surfaces: ["#000", "#0d0d0d", "#111", "#1a1a1a"] },
                  { id: "oled",  label: "OLED",  surfaces: ["#000", "#000",    "#090909", "#111"] },
                  { id: "dim",   label: "Dim",   surfaces: ["#1a1b1e", "#1e2023", "#25272b", "#34373d"] },
                  { id: "light", label: "Light", surfaces: ["#e8e8eb", "#f0f0f2", "#ffffff", "#f8f8fa"] },
                ] as const).map(({ id, label, surfaces }) => (
                  <button
                    key={id}
                    onClick={() => saveTheme(id)}
                    className={`flex-1 rounded-lg border p-3 transition-colors text-left ${
                      theme === id ? "border-accent bg-accent/5" : "border-stroke hover:border-stroke"
                    }`}
                  >
                    <div className="flex gap-1 mb-2.5 rounded overflow-hidden" style={{ height: 36 }}>
                      <div className="w-1/4 shrink-0 rounded-l" style={{ backgroundColor: surfaces[0] }} />
                      <div className="flex-1 flex flex-col gap-1 p-1 rounded-r" style={{ backgroundColor: surfaces[1] }}>
                        <div className="rounded-sm h-1.5" style={{ backgroundColor: surfaces[2], width: "70%" }} />
                        <div className="rounded-sm h-1.5" style={{ backgroundColor: surfaces[2], width: "50%" }} />
                      </div>
                    </div>
                    <p className={`text-xs font-medium ${theme === id ? "text-accent-fg" : "text-secondary"}`}>{label}</p>
                  </button>
                ))}
              </div>

              <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Accent colour</p>
              <div className="flex gap-2 flex-wrap">
                {ACCENTS.map(({ id, base }) => (
                  <button
                    key={id}
                    onClick={() => saveAccent(id)}
                    title={id.charAt(0).toUpperCase() + id.slice(1)}
                    className={`w-7 h-7 rounded-full transition-transform hover:scale-110 ${
                      accentId === id ? "ring-2 ring-white/50 scale-110" : ""
                    }`}
                    style={{ backgroundColor: base }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── Security ── */}
          {activeSection === "security" && (
            <div>
              <SectionHeader title="Security" />

              <Row>
                <RowLabel
                  title="Require master password"
                  description={isPasswordRequired
                    ? "App is locked with a password on launch."
                    : "App opens without a password. Credentials still use the OS keychain."}
                />
                <select
                  value={isPasswordRequired ? "enabled" : "disabled"}
                  onChange={(e) => { if ((e.target.value === "enabled") !== isPasswordRequired) handleToggle(); }}
                  aria-label="Require master password"
                  className="h-10 bg-surface-3 border border-stroke rounded px-2 text-sm text-white focus:outline-none focus:border-accent shrink-0"
                >
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                </select>
              </Row>

              {activeForm === "disable" && (
                <div className="mt-3 mb-2 space-y-3 p-3 bg-surface-0 rounded-lg border border-stroke-subtle">
                  <p className="text-xs text-secondary">Enter your current master password to disable vault protection.</p>
                  <PasswordInput autoFocus value={disablePwd} onChange={setDisablePwd} placeholder="Current password" />
                  {error && <p className="text-xs text-error">{error}</p>}
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => openForm("none")} className="flex-1">Cancel</Button>
                    <Button size="sm" onClick={() => { void submitDisable(); }} disabled={loading || !disablePwd} className="flex-1 bg-red-500 hover:bg-red-400 text-black font-semibold disabled:opacity-40">
                      {loading ? "Verifying…" : "Disable password"}
                    </Button>
                  </div>
                </div>
              )}

              {activeForm === "enable" && (
                <div className="mt-3 mb-2 space-y-3 p-3 bg-surface-0 rounded-lg border border-stroke-subtle">
                  <p className="text-xs text-secondary">Set a master password to protect vault access on launch.</p>
                  <div>
                    <PasswordInput autoFocus value={enablePwd} onChange={(v) => { setEnablePwd(v); setError(null); }} placeholder="New password" />
                    {enablePwd.length > 0 && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="flex-1 h-1 bg-surface-4 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${strengthColor}`} style={{ width: strengthPct }} />
                        </div>
                        <span className="text-meta text-muted w-16 text-right">{strengthLabel}</span>
                      </div>
                    )}
                  </div>
                  <PasswordInput value={enableConfirm} onChange={(v) => { setEnableConfirm(v); setError(null); }} placeholder="Confirm password" />
                  {error && <p className="text-xs text-error">{error}</p>}
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => openForm("none")} className="flex-1">Cancel</Button>
                    <Button size="sm" variant="primary" onClick={() => { void submitEnable(); }} disabled={loading || enablePwd.length < 8 || enablePwd !== enableConfirm} className="flex-1">
                      {loading ? "Setting up…" : "Enable password"}
                    </Button>
                  </div>
                </div>
              )}

              {isPasswordRequired && (
                <div>
                  <button
                    onClick={() => openForm(activeForm === "change" ? "none" : "change")}
                    className="w-full text-left py-3 text-sm text-secondary hover:text-white transition-colors flex items-center justify-between border-b border-stroke-subtle"
                  >
                    <span>Change master password</span>
                    <svg className={`w-3.5 h-3.5 text-muted transition-transform ${activeForm === "change" ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {activeForm === "change" && (
                    <div className="mb-2 space-y-3 p-3 bg-surface-0 rounded-lg border border-stroke-subtle">
                      <PasswordInput autoFocus value={changeCurrent} onChange={(v) => { setChangeCurrent(v); setError(null); }} placeholder="Current password" />
                      <div>
                        <PasswordInput value={changeNew} onChange={(v) => { setChangeNew(v); setError(null); }} placeholder="New password" />
                        {changeNew.length > 0 && (
                          <div className="mt-1.5 flex items-center gap-2">
                            <div className="flex-1 h-1 bg-surface-4 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${strengthColor}`} style={{ width: strengthPct }} />
                            </div>
                            <span className="text-meta text-muted w-16 text-right">{strengthLabel}</span>
                          </div>
                        )}
                      </div>
                      <PasswordInput value={changeConfirm} onChange={(v) => { setChangeConfirm(v); setError(null); }} placeholder="Confirm new password" />
                      {error && <p className="text-xs text-error">{error}</p>}
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => openForm("none")} className="flex-1">Cancel</Button>
                        <Button size="sm" variant="primary" onClick={() => { void submitChange(); }} disabled={loading || !changeCurrent || changeNew.length < 8 || changeNew !== changeConfirm} className="flex-1">
                          {loading ? "Updating…" : "Change password"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <Row>
                <RowLabel title="Auto-lock vault" description="Lock after this many minutes of inactivity (0 = never)" />
                <select
                  value={timeoutMins}
                  onChange={(e) => saveTimeout(e.target.value)}
                  disabled={!isPasswordRequired && timeoutMins === "0"}
                  className="h-10 bg-surface-3 border border-stroke rounded px-2 text-sm text-white focus:outline-none focus:border-accent shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {[["0","Never"],["5","5 min"],["15","15 min"],["30","30 min"],["60","1 hour"],["120","2 hours"]].map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </Row>
              {autoLockNeedsPassword && (
                <div className="mb-3 flex items-center justify-between gap-3 bg-warning-subtle border border-warning-subtle rounded-lg px-3 py-2">
                  <p className="text-xs text-warning">A master password is required to use auto-lock.</p>
                  <button onClick={() => { setAutoLockNeedsPassword(false); openForm("enable"); }} className="text-xs text-accent hover:text-accent-hover shrink-0 transition-colors">
                    Set password →
                  </button>
                </div>
              )}

              {success && (
                <p className="text-sm text-success bg-success-subtle border border-success-subtle rounded-md px-3 py-2 mt-4">
                  ✓ {success}
                </p>
              )}
            </div>
          )}

          {/* ── Terminal ── */}
          {activeSection === "terminal" && (
            <div>
              <SectionHeader title="Terminal" description="Font changes apply to new sessions. Theme applies immediately." />

              <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Colour theme</p>
              <div className="grid grid-cols-5 gap-2 mb-6">
                {TERMINAL_THEMES.map(({ id, label, bg, fg }) => (
                  <button
                    key={id}
                    onClick={() => { setTermTheme(id); flashSaved(); }}
                    title={label}
                    className={`rounded-lg border-2 overflow-hidden transition-all ${
                      termTheme === id ? "border-accent" : "border-transparent hover:border-stroke"
                    }`}
                  >
                    <div className="h-10 flex items-center justify-center gap-0.5 px-1" style={{ backgroundColor: bg }}>
                      <span className="font-mono text-[9px] leading-none select-none" style={{ color: fg }}>{">"}</span>
                      <span className="inline-block w-[5px] h-[9px] rounded-[1px]" style={{ backgroundColor: fg, opacity: 0.85 }} />
                    </div>
                    <div className="bg-surface-2 py-0.5 px-1">
                      <p className={`text-[10px] leading-tight truncate ${termTheme === id ? "text-accent-fg" : "text-secondary"}`}>{label}</p>
                    </div>
                  </button>
                ))}
              </div>

              <Row>
                <div className="min-w-0 mr-6">
                  <p className="text-sm text-white font-medium">Font</p>
                  <p className="text-meta text-muted mt-0.5 truncate" style={{ fontFamily: fontCss(fontFamily) }}>the quick brown fox</p>
                </div>
                <select
                  value={fontFamily}
                  onChange={(e) => { setFontFamily(e.target.value as typeof fontFamily); flashSaved(); }}
                  className="h-10 bg-surface-3 border border-stroke rounded px-2 text-sm text-white focus:outline-none focus:border-accent shrink-0"
                >
                  {TERMINAL_FONTS.map(({ id, label }) => (
                    <option key={id} value={id}>{label}</option>
                  ))}
                </select>
              </Row>

              <Row>
                <RowLabel title="Font size" />
                <select
                  value={fontSize}
                  onChange={(e) => { setFontSize(Number(e.target.value)); flashSaved(); }}
                  className="h-10 bg-surface-3 border border-stroke rounded px-2 text-sm text-white focus:outline-none focus:border-accent shrink-0"
                >
                  {[10, 12, 13, 14, 16, 18, 20].map((n) => (
                    <option key={n} value={n}>{n}px</option>
                  ))}
                </select>
              </Row>

              <Row>
                <RowLabel title="Line height" />
                <select
                  value={lineHeight}
                  onChange={(e) => { setLineHeight(Number(e.target.value)); flashSaved(); }}
                  className="h-10 bg-surface-3 border border-stroke rounded px-2 text-sm text-white focus:outline-none focus:border-accent shrink-0"
                >
                  {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>{n}px</option>
                  ))}
                </select>
              </Row>

              <Row>
                <RowLabel title="Scrollback lines" description="Lines retained above the viewport" />
                <select
                  value={scrollback}
                  onChange={(e) => { setScrollback(Number(e.target.value)); flashSaved(); }}
                  className="h-10 bg-surface-3 border border-stroke rounded px-2 text-sm text-white focus:outline-none focus:border-accent shrink-0"
                >
                  {[[500,"500"],[1000,"1 000"],[5000,"5 000"],[10000,"10 000"],[50000,"50 000"]].map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </Row>

              <Row>
                <RowLabel title="Copy on select" description="Automatically copy selected text to clipboard" />
                <select
                  value={copyOnSelect ? "on" : "off"}
                  onChange={(e) => { setCopyOnSelect(e.target.value === "on"); flashSaved(); }}
                  aria-label="Copy on select"
                  className="h-10 bg-surface-3 border border-stroke rounded px-2 text-sm text-white focus:outline-none focus:border-accent shrink-0"
                >
                  <option value="on">On</option>
                  <option value="off">Off</option>
                </select>
              </Row>

              <Row>
                <RowLabel title="SSH keepalive" description="Send periodic packets to prevent idle session drops" />
                <select
                  value={keepaliveInterval}
                  onChange={(e) => saveKeepalive(e.target.value)}
                  className="h-10 bg-surface-3 border border-stroke rounded px-2 text-sm text-white focus:outline-none focus:border-accent shrink-0"
                >
                  <option value="0">Disabled</option>
                  <option value="30">30 s</option>
                  <option value="60">60 s</option>
                  <option value="120">2 min</option>
                  <option value="300">5 min</option>
                </select>
              </Row>
            </div>
          )}

          {/* ── AI Assistant ── */}
          {activeSection === "assistant" && (
            <div>
              <SectionHeader
                title="AI Assistant"
                description="Bring your own API key. Off by default — when enabled, prompts you send may include terminal context and are sent to the provider you choose below."
              />

              {/* Per-provider rows */}
              {(["openai", "anthropic"] as const).map((p) => {
                const isConfigured = p === "openai" ? assistantStatus?.openaiConfigured : assistantStatus?.anthropicConfigured;
                const isAdding = addingProvider === p;
                const label = p === "openai" ? "OpenAI" : "Anthropic";
                return (
                  <div key={p} className="border-b border-stroke-subtle">
                    <div className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="text-sm text-white font-medium">{label}</span>
                        {isConfigured && (
                          <span className="text-[11px] font-medium text-success bg-success-subtle border border-success-subtle rounded px-1.5 py-0.5 leading-none">
                            Configured
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {isConfigured && (
                          <button
                            onClick={() => { setConfirmForgetProvider(p); setAssistantError(null); }}
                            disabled={assistantLoading}
                            className="text-sm text-secondary hover:text-red-400 transition-colors disabled:opacity-40"
                          >
                            Forget
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setAddingProvider(isAdding ? null : p);
                            setAddKeyInput("");
                            setAssistantError(null);
                          }}
                          className="text-sm text-secondary hover:text-white transition-colors flex items-center gap-1"
                        >
                          {isConfigured ? "Update key" : "Add key"}
                          <svg className={`w-3 h-3 text-muted transition-transform ${isAdding ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    {isAdding && (
                      <div className="mb-3 space-y-3 p-3 bg-surface-0 rounded-lg border border-stroke-subtle">
                        <PasswordInput
                          autoFocus
                          value={addKeyInput}
                          onChange={(v) => { setAddKeyInput(v); setAssistantError(null); }}
                          placeholder={`${label} API key`}
                        />
                        {assistantError && <p className="text-xs text-error">{assistantError}</p>}
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => { setAddingProvider(null); setAddKeyInput(""); setAssistantError(null); }} className="flex-1">Cancel</Button>
                          <Button size="sm" variant="primary" onClick={() => { void submitAddKey(p); }} disabled={assistantLoading || !addKeyInput.trim()} className="flex-1">
                            {assistantLoading ? "Saving…" : "Save key"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Active provider — only when both configured */}
              {assistantStatus?.openaiConfigured && assistantStatus?.anthropicConfigured && (
                <Row>
                  <RowLabel title="Active provider" description="Which provider handles your messages" />
                  <select
                    value={assistantStatus.activeProvider ?? ""}
                    onChange={(e) => { void switchToProvider(e.target.value); }}
                    aria-label="Active AI provider"
                    className="h-10 bg-surface-3 border border-stroke rounded px-2 text-sm text-white focus:outline-none focus:border-accent shrink-0"
                  >
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                  </select>
                </Row>
              )}

              {/* Enable + history — only when at least one key configured */}
              {(assistantStatus?.openaiConfigured || assistantStatus?.anthropicConfigured) && (
                <>
                  <Row>
                    <RowLabel title="Enable assistant" />
                    <select
                      value={assistantStatus!.enabled ? "enabled" : "disabled"}
                      onChange={(e) => { void toggleAssistantEnabled(e.target.value === "enabled"); }}
                      aria-label="Enable AI assistant"
                      className="h-10 bg-surface-3 border border-stroke rounded px-2 text-sm text-white focus:outline-none focus:border-accent shrink-0"
                    >
                      <option value="enabled">Enabled</option>
                      <option value="disabled">Disabled</option>
                    </select>
                  </Row>
                  <Row>
                    <RowLabel
                      title="Save chat history"
                      description="Encrypted at rest with the same key as your credentials. Off by default — turning it off erases everything already saved."
                    />
                    <select
                      value={assistantStatus!.persistHistory ? "on" : "off"}
                      onChange={(e) => { void toggleAssistantPersistHistory(e.target.value === "on"); }}
                      aria-label="Save AI assistant chat history to disk"
                      className="h-10 bg-surface-3 border border-stroke rounded px-2 text-sm text-white focus:outline-none focus:border-accent shrink-0"
                    >
                      <option value="on">On</option>
                      <option value="off">Off</option>
                    </select>
                  </Row>
                </>
              )}

              {/* Per-provider forget confirmation */}
              {confirmForgetProvider && (
                <ConfirmDeleteModal
                  title={`Forget ${confirmForgetProvider === "openai" ? "OpenAI" : "Anthropic"} key?`}
                  description="The stored API key will be permanently removed."
                  confirmLabel="Forget key"
                  busy={assistantLoading}
                  onConfirm={() => {
                    const p = confirmForgetProvider;
                    setConfirmForgetProvider(null);
                    void forgetProviderKey(p);
                  }}
                  onCancel={() => setConfirmForgetProvider(null)}
                />
              )}
            </div>
          )}

          {/* ── About ── */}
          {activeSection === "about" && (
            <div>
              <SectionHeader title="About" />

              <Row>
                <RowLabel title="Version" description={`SSHelter ${appVersion}`} />
              </Row>

              <Row>
                <RowLabel
                  title="Software updates"
                  description={
                    updateState === "checking" ? "Checking for updates…"
                    : updateState === "up-to-date" ? "You're up to date."
                    : updateState === "available" ? `Version ${updateInfo?.version} is available.`
                    : updateState === "downloading" ? "Downloading update…"
                    : updateState === "ready" ? "Update installed — restart to apply."
                    : updateState === "error" ? (updateError ?? "Update check failed.")
                    : "Check for a newer version of SSHelter."
                  }
                />
                {updateState === "ready" ? (
                  <Button size="sm" variant="primary" onClick={() => { void updaterCommands.relaunch(); }}>
                    Restart now
                  </Button>
                ) : updateState === "available" ? (
                  <Button size="sm" variant="primary" onClick={() => { void installUpdate(); }}>
                    Download &amp; install
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => { void checkForUpdates(); }}
                    disabled={updateState === "checking" || updateState === "downloading"}
                  >
                    Check for updates
                  </Button>
                )}
              </Row>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
