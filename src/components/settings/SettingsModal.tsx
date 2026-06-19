import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";
import ConfirmDeleteModal from "../shared/ConfirmDeleteModal";
import { useVaultStore } from "../../store/vaultStore";
import { useUiStore } from "../../store/uiStore";
import { useTerminalSettings, TERMINAL_FONTS, TERMINAL_THEMES, fontCss } from "../../lib/terminalSettings";
import { settingsCommands, assistantCommands, type AssistantStatus } from "../../lib/tauriCommands";
import { formatError } from "../../lib/errors";
import { passwordStrength } from "../../lib/passwordStrength";
import { shiftLightness } from "../../lib/accentColor";

interface Props {
  onClose: () => void;
}

type ActiveForm = "none" | "disable" | "enable" | "change";

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

export default function SettingsModal({ onClose }: Props) {
  const {
    isPasswordRequired,
    disablePassword,
    enablePassword,
    changePassword,
  } = useVaultStore();
  const setVaultTimeoutMins = useUiStore((s) => s.setVaultTimeoutMins);
  const { fontSize, scrollback, copyOnSelect, fontFamily, termTheme, setFontSize, setScrollback, setCopyOnSelect, setFontFamily, setTermTheme } =
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

  // AI Assistant (BYOK, opt-in)
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
    const prev = assistantStatus;
    setAssistantStatus((s) => (s ? { ...s, activeProvider: provider } : s));
    await assistantCommands.switchProvider(provider).catch((e) => {
      setAssistantStatus(prev);
      setAssistantError(formatError(e));
    });
    flashSaved();
  };
  const toggleAssistantEnabled = async (enabled: boolean) => {
    const prev = assistantStatus;
    setAssistantStatus((s) => (s ? { ...s, enabled } : s));
    await assistantCommands.setEnabled(enabled).catch((e) => {
      setAssistantStatus(prev);
      setAssistantError(formatError(e));
    });
    flashSaved();
  };
  const toggleAssistantPersistHistory = async (persistHistory: boolean) => {
    const prev = assistantStatus;
    setAssistantStatus((s) => (s ? { ...s, persistHistory } : s));
    await assistantCommands.setPersistHistory(persistHistory).catch((e) => {
      setAssistantStatus(prev);
      setAssistantError(formatError(e));
    });
    flashSaved();
  };

  const scrollBodyRef = useRef<HTMLDivElement>(null);

  // Theme
  type Theme = "dark" | "oled" | "dim" | "light";
  const [theme, setTheme] = useState<Theme>("dark");
  const saveTheme = (t: Theme) => {
    setTheme(t);
    document.documentElement.dataset.theme = t === "dark" ? "" : t;
    settingsCommands.setSetting("theme", t).catch(() => {});
    flashSaved();
  };

  // Accent colour
  const [accentId, setAccentId] = useState<AccentId | "custom">("lime");
  const [customHex, setCustomHex] = useState("#ffffff");
  const colorInputRef = useRef<HTMLInputElement>(null);
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
  const customAccentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveCustomAccent = (hex: string) => {
    setCustomHex(hex);
    setAccentId("custom");
    const root = document.documentElement;
    root.style.setProperty("--color-accent", hex);
    root.style.setProperty("--color-accent-hover", shiftLightness(hex, 15));
    root.style.setProperty("--color-accent-dim", shiftLightness(hex, -20));
    if (customAccentTimerRef.current) clearTimeout(customAccentTimerRef.current);
    customAccentTimerRef.current = setTimeout(() => {
      settingsCommands.setSetting("accent", "custom").catch(() => {});
      settingsCommands.setSetting("accent_custom_color", hex).catch(() => {});
      flashSaved();
    }, 150);
  };

  // Vault timeout
  const [timeoutMins, setTimeoutMins] = useState("0");
  const [autoLockNeedsPassword, setAutoLockNeedsPassword] = useState(false);
  const saveTimeout = (v: string | null) => {
    if (v === null) return;
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
  const saveKeepalive = (v: string | null) => {
    if (v === null) return;
    setKeepaliveInterval(v);
    settingsCommands.setSetting("ssh_keepalive_interval", v).catch(() => {});
    flashSaved();
  };

  // Load all settings in a single IPC call on mount.
  useEffect(() => {
    settingsCommands.getAllSettings().then((s) => {
      if (s.theme) setTheme(s.theme as Theme);

      if (s.accent) {
        if (s.accent === "custom") {
          setAccentId("custom");
          if (s.accent_custom_color) {
            setCustomHex(s.accent_custom_color);
            const root = document.documentElement;
            root.style.setProperty("--color-accent", s.accent_custom_color);
            root.style.setProperty("--color-accent-hover", shiftLightness(s.accent_custom_color, 15));
            root.style.setProperty("--color-accent-dim", shiftLightness(s.accent_custom_color, -20));
          }
        } else {
          setAccentId(s.accent as AccentId);
        }
      }

      if (s.vault_timeout_minutes != null) {
        setTimeoutMins(s.vault_timeout_minutes);
        setVaultTimeoutMins(Number(s.vault_timeout_minutes));
      }
      if (s.ssh_keepalive_interval != null) setKeepaliveInterval(s.ssh_keepalive_interval);
    }).catch(() => {});
  }, [setVaultTimeoutMins]);

  // Disable form state
  const [disablePwd, setDisablePwd] = useState("");

  // Enable form state
  const [enablePwd, setEnablePwd] = useState("");
  const [enableConfirm, setEnableConfirm] = useState("");

  // Change password form state
  const [changeCurrent, setChangeCurrent] = useState("");
  const [changeNew, setChangeNew] = useState("");
  const [changeConfirm, setChangeConfirm] = useState("");

  const reset = () => {
    setError(null);
    setSuccess(null);
    setDisablePwd("");
    setEnablePwd("");
    setEnableConfirm("");
    setChangeCurrent("");
    setChangeNew("");
    setChangeConfirm("");
  };

  const openForm = (form: ActiveForm) => {
    reset();
    setActiveForm(form);
  };

  const handleToggle = () => {
    if (isPasswordRequired) {
      openForm(activeForm === "disable" ? "none" : "disable");
    } else {
      openForm(activeForm === "enable" ? "none" : "enable");
    }
  };

  const submitDisable = async () => {
    setLoading(true);
    setError(null);
    try {
      await disablePassword(disablePwd);
      setSuccess("Vault password disabled. The app will no longer require a password on launch.");
      setActiveForm("none");
      setDisablePwd("");
    } catch (e) {
      setError(formatError(e));
    } finally {
      setLoading(false);
    }
  };

  const submitEnable = async () => {
    if (enablePwd !== enableConfirm) { setError("Passwords do not match."); return; }
    if (enablePwd.length < 8) { setError("Password must be at least 8 characters."); return; }
    setLoading(true);
    setError(null);
    try {
      await enablePassword(enablePwd);
      setSuccess("Vault password enabled. You will be asked for it on next launch.");
      setActiveForm("none");
      setEnablePwd("");
      setEnableConfirm("");
      setAutoLockNeedsPassword(false);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setLoading(false);
    }
  };

  const submitChange = async () => {
    if (changeNew !== changeConfirm) { setError("New passwords do not match."); return; }
    if (changeNew.length < 8) { setError("New password must be at least 8 characters."); return; }
    setLoading(true);
    setError(null);
    try {
      await changePassword(changeCurrent, changeNew);
      setSuccess("Master password changed successfully.");
      setActiveForm("none");
      setChangeCurrent("");
      setChangeNew("");
      setChangeConfirm("");
    } catch (e) {
      setError(formatError(e));
    } finally {
      setLoading(false);
    }
  };

  const { label: strengthLabel, color: strengthColor, pct: strengthPct } =
    passwordStrength(activeForm === "enable" ? enablePwd : changeNew);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-w-lg max-h-[90vh] bg-surface-1/80 backdrop-blur-2xl flex flex-col gap-0 p-0 translate-x-[-50%] translate-y-[-50%]"
      >
        {/* Header */}
        <DialogHeader className="flex flex-row items-center justify-between px-6 py-4 border-b border-stroke-subtle shrink-0 gap-0 space-y-0">
          <DialogTitle className="text-lg">Settings</DialogTitle>
          <div className="flex items-center gap-3">
            <span
              className={`text-xs text-success transition-opacity duration-300 ${savedFlash ? "opacity-100" : "opacity-0"}`}
              aria-live="polite"
            >
              ✓ Saved
            </span>
            <Button variant="ghost" size="icon-sm" onClick={onClose} className="text-muted hover:text-white" aria-label="Close">✕</Button>
          </div>
        </DialogHeader>

        <div ref={scrollBodyRef} className="px-6 py-5 space-y-6 overflow-y-auto">
          {/* Appearance section */}
          <div id="settings-appearance" data-section="appearance">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Appearance</p>
            <div className="flex gap-2">
              {([
                { id: "dark",  label: "Dark",  surfaces: ["#000",     "#0d0d0d", "#111",    "#1a1a1a"] },
                { id: "oled",  label: "OLED",  surfaces: ["#000",     "#000",    "#090909", "#111"]    },
                { id: "dim",   label: "Dim",   surfaces: ["#1a1b1e",  "#1e2023", "#25272b", "#34373d"] },
                { id: "light", label: "Light", surfaces: ["#e8e8eb",  "#f0f0f2", "#ffffff", "#f8f8fa"] },
              ] as const).map(({ id, label, surfaces }) => (
                <button
                  key={id}
                  onClick={() => saveTheme(id)}
                  className={`flex-1 rounded-lg border p-3 transition-colors text-left ${
                    theme === id ? "border-accent bg-accent/5" : "border-stroke hover:border-stroke"
                  }`}
                >
                  {/* Mini layout preview */}
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

            {/* Accent colour */}
            <p className="text-meta text-muted mt-4 mb-2">Accent colour</p>
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
              <button
                onClick={() => colorInputRef.current?.click()}
                title="Custom colour"
                className={`w-7 h-7 rounded-full transition-transform hover:scale-110 flex items-center justify-center border border-stroke ${
                  accentId === "custom" ? "ring-2 ring-white/50 scale-110" : ""
                }`}
                style={accentId === "custom" ? { backgroundColor: customHex } : {}}
              >
                {accentId !== "custom" && (
                  <svg className="w-3.5 h-3.5 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
                    <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
                    <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
                    <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
                    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
                  </svg>
                )}
              </button>
              <input
                ref={colorInputRef}
                type="color"
                value={customHex}
                onChange={(e) => saveCustomAccent(e.target.value)}
                className="sr-only"
                aria-label="Custom accent colour"
              />
            </div>
          </div>

          {/* Security section */}
          <div id="settings-security" data-section="security">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Security</p>

            {/* Vault password toggle */}
            <div className="flex items-center justify-between py-3 border-b border-stroke-subtle">
              <div>
                <p className="text-sm text-white font-medium">Require master password</p>
                <p className="text-meta text-muted mt-0.5">
                  {isPasswordRequired
                    ? "App is locked with a password on launch."
                    : "App opens without a password. Credentials still use the OS keychain."}
                </p>
              </div>
              <Select
                value={isPasswordRequired ? "enabled" : "disabled"}
                onValueChange={(value) => {
                  const wantsEnabled = value === "enabled";
                  if (wantsEnabled !== isPasswordRequired) handleToggle();
                }}
              >
                <SelectTrigger aria-label="Require master password" className="ml-4 h-10 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="enabled">Enabled</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Disable password form */}
            {activeForm === "disable" && (
              <div className="mt-3 space-y-3 p-3 bg-surface-0 rounded-lg border border-stroke-subtle">
                <p className="text-xs text-secondary">Enter your current master password to disable vault protection.</p>
                <PasswordInput
                  autoFocus
                  value={disablePwd}
                  onChange={setDisablePwd}
                  placeholder="Current password"
                />
                {error && <p className="text-xs text-error">{error}</p>}
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => openForm("none")} className="flex-1">Cancel</Button>
                  <Button onClick={() => { void submitDisable(); }} disabled={loading || !disablePwd} className="flex-1 bg-red-500 hover:bg-red-400 text-black font-semibold disabled:opacity-40">
                    {loading ? "Verifying…" : "Disable password"}
                  </Button>
                </div>
              </div>
            )}

            {/* Enable password form */}
            {activeForm === "enable" && (
              <div className="mt-3 space-y-3 p-3 bg-surface-0 rounded-lg border border-stroke-subtle">
                <p className="text-xs text-secondary">Set a master password to protect vault access on launch.</p>
                <div>
                  <PasswordInput
                    autoFocus
                    value={enablePwd}
                    onChange={(v) => { setEnablePwd(v); setError(null); }}
                    placeholder="New password"
                  />
                  {enablePwd.length > 0 && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="flex-1 h-1 bg-surface-4 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${strengthColor}`} style={{ width: strengthPct }} />
                      </div>
                      <span className="text-meta text-muted w-16 text-right">{strengthLabel}</span>
                    </div>
                  )}
                </div>
                <PasswordInput
                  value={enableConfirm}
                  onChange={(v) => { setEnableConfirm(v); setError(null); }}
                  placeholder="Confirm password"
                />
                {error && <p className="text-xs text-error">{error}</p>}
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => openForm("none")} className="flex-1">Cancel</Button>
                  <Button onClick={() => { void submitEnable(); }} disabled={loading || enablePwd.length < 8 || enablePwd !== enableConfirm} className="flex-1">
                    {loading ? "Setting up…" : "Enable password"}
                  </Button>
                </div>
              </div>
            )}

            {/* Change password button + form */}
            {isPasswordRequired && (
              <div className="mt-1">
                <Button
                  variant="ghost"
                  onClick={() => openForm(activeForm === "change" ? "none" : "change")}
                  className="w-full justify-between text-left py-3 h-auto text-sm text-secondary hover:text-white"
                >
                  <span>Change master password</span>
                  <svg className={`w-3.5 h-3.5 text-muted transition-transform ${activeForm === "change" ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </Button>

                {activeForm === "change" && (
                  <div className="mb-2 space-y-3 p-3 bg-surface-0 rounded-lg border border-stroke-subtle">
                    <PasswordInput
                      autoFocus
                      value={changeCurrent}
                      onChange={(v) => { setChangeCurrent(v); setError(null); }}
                      placeholder="Current password"
                    />
                    <div>
                      <PasswordInput
                        value={changeNew}
                        onChange={(v) => { setChangeNew(v); setError(null); }}
                        placeholder="New password"
                      />
                      {changeNew.length > 0 && (
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="flex-1 h-1 bg-surface-4 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${strengthColor}`} style={{ width: strengthPct }} />
                          </div>
                          <span className="text-meta text-muted w-16 text-right">{strengthLabel}</span>
                        </div>
                      )}
                    </div>
                    <PasswordInput
                      value={changeConfirm}
                      onChange={(v) => { setChangeConfirm(v); setError(null); }}
                      placeholder="Confirm new password"
                    />
                    {error && <p className="text-xs text-error">{error}</p>}
                    <div className="flex gap-2">
                      <Button variant="secondary" onClick={() => openForm("none")} className="flex-1">Cancel</Button>
                      <Button onClick={() => { void submitChange(); }} disabled={loading || !changeCurrent || changeNew.length < 8 || changeNew !== changeConfirm} className="flex-1">
                        {loading ? "Updating…" : "Change password"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>

          {/* Vault timeout */}
          <div className="py-3 border-b border-stroke-subtle">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white font-medium">Auto-lock vault</p>
                <p className="text-meta text-muted mt-0.5">Lock after this many minutes of inactivity (0 = never)</p>
              </div>
              <Select
                value={timeoutMins}
                onValueChange={saveTimeout}
                disabled={!isPasswordRequired && timeoutMins === "0"}
              >
                <SelectTrigger className="ml-4 h-10 shrink-0">
                  <SelectValue>
                    {(val) => ({"0":"Never","5":"5 min","15":"15 min","30":"30 min","60":"1 hour","120":"2 hours"} as Record<string,string>)[String(val)] ?? String(val)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {[["0","Never"],["5","5 min"],["15","15 min"],["30","30 min"],["60","1 hour"],["120","2 hours"]].map(([v, l]) => (
                    <SelectItem key={v} value={v} label={l}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {autoLockNeedsPassword && (
              <div className="mt-2 flex items-center justify-between gap-3 bg-warning-subtle border border-warning-subtle rounded-lg px-3 py-2">
                <p className="text-xs text-warning">A master password is required to use auto-lock.</p>
                <Button
                  variant="ghost"
                  onClick={() => { setAutoLockNeedsPassword(false); openForm("enable"); }}
                  className="h-auto px-0 text-xs text-accent hover:text-accent-hover hover:bg-transparent shrink-0"
                >
                  Set password →
                </Button>
              </div>
            )}
          </div>

          {/* Terminal section */}
          <div id="settings-terminal" data-section="terminal">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Terminal</p>
            <p className="text-meta text-faint mb-3">Font changes apply to new sessions. Theme applies immediately.</p>

            {/* Colour theme swatches */}
            <div className="pb-3 border-b border-stroke-subtle mb-0">
              <p className="text-sm text-white font-medium mb-2">Colour theme</p>
              <div className="grid grid-cols-5 gap-2">
                {TERMINAL_THEMES.map(({ id, label, bg, fg }) => (
                  <button
                    key={id}
                    onClick={() => { setTermTheme(id); flashSaved(); }}
                    title={label}
                    className={`rounded-lg border-2 overflow-hidden transition-all ${
                      termTheme === id ? "border-accent" : "border-transparent hover:border-stroke"
                    }`}
                  >
                    <div
                      className="h-10 flex items-center justify-center gap-0.5 px-1"
                      style={{ backgroundColor: bg }}
                    >
                      <span className="font-mono text-[9px] leading-none select-none" style={{ color: fg }}>{">"}</span>
                      <span
                        className="inline-block w-[5px] h-[9px] rounded-[1px]"
                        style={{ backgroundColor: fg, opacity: 0.85 }}
                      />
                    </div>
                    <div className="bg-surface-2 py-0.5 px-1">
                      <p className={`text-[10px] leading-tight truncate ${termTheme === id ? "text-accent-fg" : "text-secondary"}`}>
                        {label}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between py-3 border-b border-stroke-subtle">
              <div className="min-w-0 mr-4">
                <p className="text-sm text-white font-medium">Font</p>
                <p
                  className="text-meta text-muted mt-0.5 truncate"
                  style={{ fontFamily: fontCss(fontFamily) }}
                >
                  the quick brown fox
                </p>
              </div>
              <Select
                value={fontFamily}
                onValueChange={(value) => { setFontFamily(value as typeof fontFamily); flashSaved(); }}
              >
                <SelectTrigger className="h-10 shrink-0">
                  <SelectValue>
                    {(val) => TERMINAL_FONTS.find((f) => f.id === val)?.label ?? String(val)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {TERMINAL_FONTS.map(({ id, label }) => (
                    <SelectItem key={id} value={id} label={label}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between py-3 border-b border-stroke-subtle">
              <div>
                <p className="text-sm text-white font-medium">Font size</p>
              </div>
              <Select
                value={String(fontSize)}
                onValueChange={(value) => { setFontSize(Number(value)); flashSaved(); }}
              >
                <SelectTrigger className="ml-4 h-10 shrink-0">
                  <SelectValue>{(val) => `${val}px`}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {[10, 12, 13, 14, 16, 18, 20].map((n) => (
                    <SelectItem key={n} value={String(n)} label={`${n}px`}>{n}px</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between py-3 border-b border-stroke-subtle">
              <div>
                <p className="text-sm text-white font-medium">Scrollback lines</p>
                <p className="text-meta text-muted mt-0.5">Lines retained above the viewport</p>
              </div>
              <Select
                value={String(scrollback)}
                onValueChange={(value) => { setScrollback(Number(value)); flashSaved(); }}
              >
                <SelectTrigger className="ml-4 h-10 shrink-0">
                  <SelectValue>
                    {(val) => ({"500":"500","1000":"1 000","5000":"5 000","10000":"10 000","50000":"50 000"} as Record<string,string>)[String(val)] ?? String(val)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {[[500,"500"],[1000,"1 000"],[5000,"5 000"],[10000,"10 000"],[50000,"50 000"]].map(([v, l]) => (
                    <SelectItem key={v} value={String(v)} label={String(l)}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm text-white font-medium">Copy on select</p>
                <p className="text-meta text-muted mt-0.5">Automatically copy selected text to clipboard</p>
              </div>
              <Select
                value={copyOnSelect ? "on" : "off"}
                onValueChange={(value) => { setCopyOnSelect(value === "on"); flashSaved(); }}
              >
                <SelectTrigger aria-label="Copy on select" className="ml-4 h-10 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="on">On</SelectItem>
                  <SelectItem value="off">Off</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between py-3 border-t border-stroke-subtle">
              <div className="min-w-0 mr-4">
                <p className="text-sm text-white font-medium">SSH keepalive</p>
                <p className="text-meta text-muted mt-0.5">Send periodic packets to prevent idle session drops</p>
              </div>
              <Select value={keepaliveInterval} onValueChange={saveKeepalive}>
                <SelectTrigger className="h-10 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Disabled</SelectItem>
                  <SelectItem value="30">30 s</SelectItem>
                  <SelectItem value="60">60 s</SelectItem>
                  <SelectItem value="120">2 min</SelectItem>
                  <SelectItem value="300">5 min</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* AI Assistant section (BYOK, opt-in) */}
          <div id="settings-assistant" data-section="assistant">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">AI Assistant</p>
            <p className="text-meta text-faint mb-3">
              Bring your own API key. Off by default — when enabled, prompts you send may
              include terminal context and are sent to the provider you choose below.
            </p>

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
                        <Button
                          variant="ghost"
                          onClick={() => { setConfirmForgetProvider(p); setAssistantError(null); }}
                          disabled={assistantLoading}
                          className="h-auto px-0 text-sm text-secondary hover:text-red-400 hover:bg-transparent"
                        >
                          Forget
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setAddingProvider(isAdding ? null : p);
                          setAddKeyInput("");
                          setAssistantError(null);
                        }}
                        className="h-auto px-0 text-sm text-secondary hover:text-white hover:bg-transparent gap-1"
                      >
                        {isConfigured ? "Update key" : "Add key"}
                        <svg className={`w-3 h-3 text-muted transition-transform ${isAdding ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </Button>
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
                        <Button variant="secondary" onClick={() => { setAddingProvider(null); setAddKeyInput(""); setAssistantError(null); }} className="flex-1">Cancel</Button>
                        <Button onClick={() => { void submitAddKey(p); }} disabled={assistantLoading || !addKeyInput.trim()} className="flex-1">
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
              <div className="flex items-center justify-between py-3 border-b border-stroke-subtle">
                <p className="text-sm text-white font-medium">Active provider</p>
                <Select
                  value={assistantStatus.activeProvider ?? "openai"}
                  onValueChange={(value) => { if (value) void switchToProvider(value); }}
                >
                  <SelectTrigger aria-label="Active AI provider" className="ml-4 h-10 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="anthropic">Anthropic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Enable + history — only when at least one key configured */}
            {(assistantStatus?.openaiConfigured || assistantStatus?.anthropicConfigured) && (
              <>
                <div className="flex items-center justify-between py-3 border-b border-stroke-subtle">
                  <p className="text-sm text-white font-medium">Enable assistant</p>
                  <Select
                    value={(assistantStatus?.enabled ?? false) ? "enabled" : "disabled"}
                    onValueChange={(value) => { void toggleAssistantEnabled(value === "enabled"); }}
                  >
                    <SelectTrigger aria-label="Enable AI assistant" className="ml-4 h-10 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="enabled">Enabled</SelectItem>
                      <SelectItem value="disabled">Disabled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between py-3 border-b border-stroke-subtle">
                  <div>
                    <p className="text-sm text-white font-medium">Save chat history</p>
                    <p className="text-meta text-muted mt-0.5">
                      Encrypted at rest with the same key as your credentials. Off by default —
                      turning it off erases everything already saved.
                    </p>
                  </div>
                  <Select
                    value={(assistantStatus?.persistHistory ?? false) ? "on" : "off"}
                    onValueChange={(value) => { void toggleAssistantPersistHistory(value === "on"); }}
                  >
                    <SelectTrigger aria-label="Save AI assistant chat history to disk" className="ml-4 h-10 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="on">On</SelectItem>
                      <SelectItem value="off">Off</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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

          {/* Success banner */}
          {success && (
            <p className="text-sm text-success bg-success-subtle border border-success-subtle rounded-md px-3 py-2">
              ✓ {success}
            </p>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-stroke-subtle">
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
