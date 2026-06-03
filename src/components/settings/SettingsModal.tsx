import { useState, useEffect, useRef, useCallback } from "react";
import Input from "../shared/Input";
import Button from "../shared/Button";
import { useVaultStore } from "../../store/vaultStore";
import { useUiStore } from "../../store/uiStore";
import { useTerminalSettings, TERMINAL_FONTS, fontCss } from "../../lib/terminalSettings";
import { settingsCommands } from "../../lib/tauriCommands";
import { formatError } from "../../lib/errors";
import { passwordStrength } from "../../lib/passwordStrength";

interface Props {
  onClose: () => void;
}

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

export default function SettingsModal({ onClose }: Props) {
  const {
    isPasswordRequired,
    isBiometricAvailable,
    isBiometricEnabled,
    disablePassword,
    enablePassword,
    changePassword,
    enableBiometric,
    disableBiometric,
  } = useVaultStore();
  const setVaultTimeoutMins = useUiStore((s) => s.setVaultTimeoutMins);
  const { fontSize, scrollback, copyOnSelect, fontFamily, setFontSize, setScrollback, setCopyOnSelect, setFontFamily } =
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

  const scrollBodyRef = useRef<HTMLDivElement>(null);

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

  const [biometricLoading, setBiometricLoading] = useState(false);

  const toggleBiometric = async () => {
    setBiometricLoading(true);
    setError(null);
    try {
      if (isBiometricEnabled) {
        await disableBiometric();
        setSuccess("Touch ID unlock disabled.");
      } else {
        await enableBiometric();
        setSuccess("Touch ID unlock enabled. Use Touch ID on the lock screen.");
      }
    } catch (e) {
      setError(formatError(e));
    } finally {
      setBiometricLoading(false);
    }
  };

  const { label: strengthLabel, color: strengthColor, pct: strengthPct } =
    passwordStrength(activeForm === "enable" ? enablePwd : changeNew);

  return (
    <div
      className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface-1 border border-stroke-subtle rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stroke-subtle shrink-0">
          <h2 className="text-lg font-semibold text-white">Settings</h2>
          <div className="flex items-center gap-3">
            <span
              className={`text-xs text-accent-fg transition-opacity duration-300 ${savedFlash ? "opacity-100" : "opacity-0"}`}
              aria-live="polite"
            >
              ✓ Saved
            </span>
            <button onClick={onClose} className="text-muted hover:text-white p-1 rounded" aria-label="Close">✕</button>
          </div>
        </div>

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
            <p className="text-xs text-muted mt-4 mb-2">Accent colour</p>
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

          {/* Security section */}
          <div id="settings-security" data-section="security">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Security</p>

            {/* Vault password toggle */}
            <div className="flex items-center justify-between py-3 border-b border-stroke-subtle">
              <div>
                <p className="text-sm text-white font-medium">Require master password</p>
                <p className="text-xs text-muted mt-0.5">
                  {isPasswordRequired
                    ? "App is locked with a password on launch."
                    : "App opens without a password. Credentials still use the OS keychain."}
                </p>
              </div>
              <button
                onClick={handleToggle}
                className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ml-4 ${
                  isPasswordRequired ? "bg-accent" : "bg-dim"
                }`}
                aria-label="Toggle vault password"
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    isPasswordRequired ? "translate-x-[22px]" : "translate-x-0"
                  }`}
                />
              </button>
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
                {error && <p className="text-xs text-red-400">{error}</p>}
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => openForm("none")} className="flex-1">Cancel</Button>
                  <Button size="sm" onClick={() => { void submitDisable(); }} disabled={loading || !disablePwd} className="flex-1 bg-red-500 hover:bg-red-400 text-black font-semibold disabled:opacity-40">
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
                      <span className="text-xs text-muted w-16 text-right">{strengthLabel}</span>
                    </div>
                  )}
                </div>
                <PasswordInput
                  value={enableConfirm}
                  onChange={(v) => { setEnableConfirm(v); setError(null); }}
                  placeholder="Confirm password"
                />
                {error && <p className="text-xs text-red-400">{error}</p>}
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => openForm("none")} className="flex-1">Cancel</Button>
                  <Button size="sm" variant="primary" onClick={() => { void submitEnable(); }} disabled={loading || enablePwd.length < 8 || enablePwd !== enableConfirm} className="flex-1">
                    {loading ? "Setting up…" : "Enable password"}
                  </Button>
                </div>
              </div>
            )}

            {/* Change password button + form */}
            {isPasswordRequired && (
              <div className="mt-1">
                <button
                  onClick={() => openForm(activeForm === "change" ? "none" : "change")}
                  className="w-full text-left py-3 text-sm text-secondary hover:text-white transition-colors flex items-center justify-between"
                >
                  <span>Change master password</span>
                  <svg className={`w-3.5 h-3.5 text-muted transition-transform ${activeForm === "change" ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

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
                          <span className="text-xs text-muted w-16 text-right">{strengthLabel}</span>
                        </div>
                      )}
                    </div>
                    <PasswordInput
                      value={changeConfirm}
                      onChange={(v) => { setChangeConfirm(v); setError(null); }}
                      placeholder="Confirm new password"
                    />
                    {error && <p className="text-xs text-red-400">{error}</p>}
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

            {/* Touch ID toggle — only shown when hardware is available and a password protects the vault */}
            {isBiometricAvailable && isPasswordRequired && (
              <div className="flex items-center justify-between py-3 border-t border-stroke-subtle">
                <div>
                  <p className="text-sm text-white font-medium">Touch ID unlock</p>
                  <p className="text-xs text-muted mt-0.5">
                    {isBiometricEnabled
                      ? "Touch ID will be offered on the lock screen."
                      : "Use Touch ID instead of typing your password."}
                  </p>
                </div>
                <button
                  onClick={() => { void toggleBiometric(); }}
                  disabled={biometricLoading}
                  className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ml-4 disabled:opacity-40 ${
                    isBiometricEnabled ? "bg-accent" : "bg-dim"
                  }`}
                  aria-label="Toggle Touch ID unlock"
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                      isBiometricEnabled ? "translate-x-[22px]" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            )}
          </div>

          {/* Vault timeout */}
          <div className="py-3 border-b border-stroke-subtle">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white font-medium">Auto-lock vault</p>
                <p className="text-xs text-muted mt-0.5">Lock after this many minutes of inactivity (0 = never)</p>
              </div>
              <select
                value={timeoutMins}
                onChange={(e) => saveTimeout(e.target.value)}
                disabled={!isPasswordRequired && timeoutMins === "0"}
                className="ml-4 h-10 bg-surface-3 border border-stroke rounded px-2 text-sm text-white focus:outline-none focus:border-accent shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {[["0","Never"],["5","5 min"],["15","15 min"],["30","30 min"],["60","1 hour"],["120","2 hours"]].map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            {autoLockNeedsPassword && (
              <div className="mt-2 flex items-center justify-between gap-3 bg-[#1a1a0a] border border-yellow-800/50 rounded-lg px-3 py-2">
                <p className="text-xs text-yellow-400">A master password is required to use auto-lock.</p>
                <button
                  onClick={() => { setAutoLockNeedsPassword(false); openForm("enable"); }}
                  className="text-xs text-accent hover:text-accent-hover shrink-0 transition-colors"
                >
                  Set password →
                </button>
              </div>
            )}
          </div>

          {/* Terminal section */}
          <div id="settings-terminal" data-section="terminal">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Terminal</p>
            <p className="text-xs text-faint mb-3">Changes apply to new sessions.</p>

            <div className="flex items-center justify-between py-3 border-b border-stroke-subtle">
              <div className="min-w-0 mr-4">
                <p className="text-sm text-white font-medium">Font</p>
                <p
                  className="text-xs text-muted mt-0.5 truncate"
                  style={{ fontFamily: fontCss(fontFamily) }}
                >
                  the quick brown fox
                </p>
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
            </div>

            <div className="flex items-center justify-between py-3 border-b border-stroke-subtle">
              <div>
                <p className="text-sm text-white font-medium">Font size</p>
              </div>
              <select
                value={fontSize}
                onChange={(e) => { setFontSize(Number(e.target.value)); flashSaved(); }}
                className="ml-4 h-10 bg-surface-3 border border-stroke rounded px-2 text-sm text-white focus:outline-none focus:border-accent shrink-0"
              >
                {[10, 12, 13, 14, 16, 18, 20].map((n) => (
                  <option key={n} value={n}>{n}px</option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between py-3 border-b border-stroke-subtle">
              <div>
                <p className="text-sm text-white font-medium">Scrollback lines</p>
                <p className="text-xs text-muted mt-0.5">Lines retained above the viewport</p>
              </div>
              <select
                value={scrollback}
                onChange={(e) => { setScrollback(Number(e.target.value)); flashSaved(); }}
                className="ml-4 h-10 bg-surface-3 border border-stroke rounded px-2 text-sm text-white focus:outline-none focus:border-accent shrink-0"
              >
                {[[500,"500"],[1000,"1 000"],[5000,"5 000"],[10000,"10 000"],[50000,"50 000"]].map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm text-white font-medium">Copy on select</p>
                <p className="text-xs text-muted mt-0.5">Automatically copy selected text to clipboard</p>
              </div>
              <button
                onClick={() => { setCopyOnSelect(!copyOnSelect); flashSaved(); }}
                className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ml-4 ${
                  copyOnSelect ? "bg-accent" : "bg-dim"
                }`}
                aria-label="Toggle copy on select"
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    copyOnSelect ? "translate-x-[22px]" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between py-3 border-t border-stroke-subtle">
              <div className="min-w-0 mr-4">
                <p className="text-sm text-white font-medium">SSH keepalive</p>
                <p className="text-xs text-muted mt-0.5">Send periodic packets to prevent idle session drops</p>
              </div>
              <select
                value={keepaliveInterval}
                onChange={(e) => saveKeepalive(e.target.value)}
                className="bg-surface-3 border border-stroke rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-accent transition-colors shrink-0"
              >
                <option value="0">Disabled</option>
                <option value="30">30 s</option>
                <option value="60">60 s</option>
                <option value="120">2 min</option>
                <option value="300">5 min</option>
              </select>
            </div>
          </div>

          {/* Success banner */}
          {success && (
            <p className="text-sm text-green-400 bg-green-950 border border-green-800 rounded-md px-3 py-2">
              ✓ {success}
            </p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-stroke-subtle flex justify-end">
          <Button
          size="sm"
          variant="primary"
          onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  );
}
