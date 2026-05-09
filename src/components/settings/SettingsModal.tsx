import { useState, useEffect } from "react";
import { save, open as openDialog } from "@tauri-apps/plugin-dialog";
import { useVaultStore } from "../../store/vaultStore";
import { useServerStore } from "../../store/serverStore";
import { useTerminalSettings } from "../../lib/terminalSettings";
import { backupCommands, settingsCommands } from "../../lib/tauriCommands";
import { formatError } from "../../lib/errors";

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
    <input
      autoFocus={autoFocus}
      type="password"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded px-3 py-2 text-sm text-white placeholder-[#666] focus:outline-none focus:border-accent transition-colors"
    />
  );
}

function strength(pwd: string): { label: string; color: string; pct: string } {
  if (pwd.length === 0) return { label: "", color: "bg-[#222]", pct: "0%" };
  if (pwd.length < 8)   return { label: "Too short", color: "bg-red-500",    pct: "25%" };
  if (pwd.length < 12)  return { label: "Weak",      color: "bg-orange-500", pct: "50%" };
  if (pwd.length < 16)  return { label: "Moderate",  color: "bg-yellow-400", pct: "75%" };
  return                       { label: "Strong",    color: "bg-accent",     pct: "100%" };
}

export default function SettingsModal({ onClose }: Props) {
  const { isPasswordRequired, disablePassword, enablePassword, changePassword } = useVaultStore();
  const fetchAll = useServerStore((s) => s.fetchAll);
  const { fontSize, scrollback, copyOnSelect, setFontSize, setScrollback, setCopyOnSelect } =
    useTerminalSettings();
  const [activeForm, setActiveForm] = useState<ActiveForm>("none");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Vault timeout
  const [timeoutMins, setTimeoutMins] = useState("0");
  useEffect(() => {
    settingsCommands.getSetting("vault_timeout_minutes")
      .then((v) => { if (v !== null) setTimeoutMins(v); })
      .catch(() => {});
  }, []);
  const [autoLockNeedsPassword, setAutoLockNeedsPassword] = useState(false);
  const saveTimeout = (v: string) => {
    if (v !== "0" && !isPasswordRequired) {
      setAutoLockNeedsPassword(true);
      return;
    }
    setAutoLockNeedsPassword(false);
    setTimeoutMins(v);
    settingsCommands.setSetting("vault_timeout_minutes", v).catch(() => {});
  };

  // Backup state
  const [backupMode, setBackupMode] = useState<"none" | "export" | "import">("none");
  const [backupPwd, setBackupPwd] = useState("");
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupMsg, setBackupMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Disable form state
  const [disablePwd, setDisablePwd] = useState("");

  // Enable form state
  const [enablePwd, setEnablePwd] = useState("");
  const [enableConfirm, setEnableConfirm] = useState("");

  // Change password form state
  const [changeCurrent, setChangeCurrent] = useState("");
  const [changeNew, setChangeNew] = useState("");
  const [changeConfirm, setChangeConfirm] = useState("");

  const openBackupForm = (mode: "export" | "import") => {
    setBackupMode((prev) => (prev === mode ? "none" : mode));
    setBackupPwd("");
    setBackupMsg(null);
  };

  const handleExport = async () => {
    if (!backupPwd) return;
    setBackupLoading(true);
    setBackupMsg(null);
    try {
      const path = await save({
        defaultPath: `ssh-manager-backup-${new Date().toISOString().slice(0, 10)}.sshbak`,
        filters: [{ name: "SSH Manager Backup", extensions: ["sshbak"] }],
      });
      if (!path) { setBackupLoading(false); return; }
      await backupCommands.exportBackup(backupPwd, path);
      setBackupMsg({ type: "ok", text: "Backup exported successfully." });
      setBackupPwd("");
      setBackupMode("none");
    } catch (e) {
      setBackupMsg({ type: "err", text: formatError(e) });
    } finally {
      setBackupLoading(false);
    }
  };

  const handleImport = async () => {
    if (!backupPwd) return;
    setBackupLoading(true);
    setBackupMsg(null);
    try {
      const selected = await openDialog({
        multiple: false,
        filters: [{ name: "SSH Manager Backup", extensions: ["sshbak"] }],
      });
      if (!selected) { setBackupLoading(false); return; }
      const path = typeof selected === "string" ? selected : selected[0];
      const summary = await backupCommands.importBackup(path, backupPwd);
      await fetchAll();
      setBackupMsg({
        type: "ok",
        text: `Imported ${summary.serversImported} server(s), ${summary.groupsImported} group(s), ${summary.tagsImported} tag(s).${summary.serversSkipped > 0 ? ` ${summary.serversSkipped} already existed and were skipped.` : ""}`,
      });
      setBackupPwd("");
      setBackupMode("none");
    } catch (e) {
      setBackupMsg({ type: "err", text: formatError(e) });
    } finally {
      setBackupLoading(false);
    }
  };

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
    strength(activeForm === "enable" ? enablePwd : changeNew);

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#111] border border-[#1e1e1e] rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e1e1e] shrink-0">
          <h2 className="text-lg font-semibold text-white">Settings</h2>
          <button onClick={onClose} className="text-[#777] hover:text-white p-1 rounded" aria-label="Close">✕</button>
        </div>

        {/* Section jump nav */}
        <div className="flex items-center gap-4 px-6 py-2 border-b border-[#1e1e1e] shrink-0">
          {(["Security", "Data", "Terminal"] as const).map((s) => (
            <a
              key={s}
              href={`#settings-${s.toLowerCase()}`}
              className="text-xs text-[#555] hover:text-[#bbb] transition-colors"
            >
              {s}
            </a>
          ))}
        </div>

        <div className="px-6 py-5 space-y-6 overflow-y-auto">
          {/* Security section */}
          <div id="settings-security">
            <p className="text-xs font-semibold text-[#777] uppercase tracking-wider mb-3">Security</p>

            {/* Vault password toggle */}
            <div className="flex items-center justify-between py-3 border-b border-[#1e1e1e]">
              <div>
                <p className="text-sm text-white font-medium">Require master password</p>
                <p className="text-xs text-[#777] mt-0.5">
                  {isPasswordRequired
                    ? "App is locked with a password on launch."
                    : "App opens without a password. Credentials still use the OS keychain."}
                </p>
              </div>
              <button
                onClick={handleToggle}
                className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ml-4 ${
                  isPasswordRequired ? "bg-accent" : "bg-[#333]"
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
              <div className="mt-3 space-y-3 p-3 bg-[#0d0d0d] rounded-lg border border-[#1e1e1e]">
                <p className="text-xs text-[#bbb]">Enter your current master password to disable vault protection.</p>
                <PasswordInput
                  autoFocus
                  value={disablePwd}
                  onChange={setDisablePwd}
                  placeholder="Current password"
                />
                {error && <p className="text-xs text-red-400">{error}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => openForm("none")}
                    className="flex-1 py-2 text-xs text-[#777] hover:text-white bg-[#1a1a1a] hover:bg-[#222] rounded transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => { void submitDisable(); }}
                    disabled={loading || !disablePwd}
                    className="flex-1 py-2 text-xs text-black bg-red-500 hover:bg-red-400 disabled:opacity-40 rounded transition-colors font-semibold"
                  >
                    {loading ? "Verifying…" : "Disable password"}
                  </button>
                </div>
              </div>
            )}

            {/* Enable password form */}
            {activeForm === "enable" && (
              <div className="mt-3 space-y-3 p-3 bg-[#0d0d0d] rounded-lg border border-[#1e1e1e]">
                <p className="text-xs text-[#bbb]">Set a master password to protect vault access on launch.</p>
                <div>
                  <PasswordInput
                    autoFocus
                    value={enablePwd}
                    onChange={(v) => { setEnablePwd(v); setError(null); }}
                    placeholder="New password"
                  />
                  {enablePwd.length > 0 && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="flex-1 h-1 bg-[#222] rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${strengthColor}`} style={{ width: strengthPct }} />
                      </div>
                      <span className="text-xs text-[#777] w-16 text-right">{strengthLabel}</span>
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
                  <button
                    onClick={() => openForm("none")}
                    className="flex-1 py-2 text-xs text-[#777] hover:text-white bg-[#1a1a1a] hover:bg-[#222] rounded transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => { void submitEnable(); }}
                    disabled={loading || enablePwd.length < 8 || enablePwd !== enableConfirm}
                    className="flex-1 py-2 text-xs text-black bg-accent hover:bg-accent-hover disabled:opacity-40 rounded transition-colors font-semibold"
                  >
                    {loading ? "Setting up…" : "Enable password"}
                  </button>
                </div>
              </div>
            )}

            {/* Change password button + form */}
            {isPasswordRequired && (
              <div className="mt-1">
                <button
                  onClick={() => openForm(activeForm === "change" ? "none" : "change")}
                  className="w-full text-left py-3 text-sm text-[#bbb] hover:text-white transition-colors flex items-center justify-between"
                >
                  <span>Change master password</span>
                  <svg className={`w-3.5 h-3.5 text-[#777] transition-transform ${activeForm === "change" ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {activeForm === "change" && (
                  <div className="mb-2 space-y-3 p-3 bg-[#0d0d0d] rounded-lg border border-[#1e1e1e]">
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
                          <div className="flex-1 h-1 bg-[#222] rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${strengthColor}`} style={{ width: strengthPct }} />
                          </div>
                          <span className="text-xs text-[#777] w-16 text-right">{strengthLabel}</span>
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
                      <button
                        onClick={() => openForm("none")}
                        className="flex-1 py-2 text-xs text-[#777] hover:text-white bg-[#1a1a1a] hover:bg-[#222] rounded transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => { void submitChange(); }}
                        disabled={loading || !changeCurrent || changeNew.length < 8 || changeNew !== changeConfirm}
                        className="flex-1 py-2 text-xs text-black bg-accent hover:bg-accent-hover disabled:opacity-40 rounded transition-colors font-semibold"
                      >
                        {loading ? "Updating…" : "Change password"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Vault timeout */}
          <div className="py-3 border-b border-[#1e1e1e]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white font-medium">Auto-lock vault</p>
                <p className="text-xs text-[#777] mt-0.5">Lock after this many minutes of inactivity (0 = never)</p>
              </div>
              <select
                value={timeoutMins}
                onChange={(e) => saveTimeout(e.target.value)}
                disabled={!isPasswordRequired && timeoutMins === "0"}
                className="ml-4 bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-accent shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
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

          {/* Backup section */}
          <div id="settings-data">
            <p className="text-xs font-semibold text-[#777] uppercase tracking-wider mb-3">Data</p>
            <p className="text-xs text-[#555] mb-3">
              Backups contain server metadata only — credentials are never included.
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => openBackupForm("export")}
                className={`flex-1 py-2 text-sm rounded transition-colors border ${
                  backupMode === "export"
                    ? "border-accent text-white bg-[#111]"
                    : "border-[#2a2a2a] text-[#bbb] bg-[#1a1a1a] hover:bg-[#222]"
                }`}
              >
                Export Backup
              </button>
              <button
                onClick={() => openBackupForm("import")}
                className={`flex-1 py-2 text-sm rounded transition-colors border ${
                  backupMode === "import"
                    ? "border-accent text-white bg-[#111]"
                    : "border-[#2a2a2a] text-[#bbb] bg-[#1a1a1a] hover:bg-[#222]"
                }`}
              >
                Import Backup
              </button>
            </div>

            {(backupMode === "export" || backupMode === "import") && (
              <div className="mt-3 space-y-3 p-3 bg-[#0d0d0d] rounded-lg border border-[#1e1e1e]">
                <p className="text-xs text-[#bbb]">
                  {backupMode === "export"
                    ? "Encrypt the backup with a password. You will need this password to restore."
                    : "Enter the password used when the backup was created."}
                </p>
                <PasswordInput
                  autoFocus
                  value={backupPwd}
                  onChange={setBackupPwd}
                  placeholder={backupMode === "export" ? "Backup password" : "Backup password"}
                />
                {backupMsg && (
                  <p className={`text-xs ${backupMsg.type === "ok" ? "text-green-400" : "text-red-400"}`}>
                    {backupMsg.text}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => { setBackupMode("none"); setBackupPwd(""); setBackupMsg(null); }}
                    className="flex-1 py-2 text-xs text-[#777] hover:text-white bg-[#1a1a1a] hover:bg-[#222] rounded transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => { void (backupMode === "export" ? handleExport() : handleImport()); }}
                    disabled={backupLoading || !backupPwd}
                    className="flex-1 py-2 text-xs text-black bg-accent hover:bg-accent-hover disabled:opacity-40 rounded transition-colors font-semibold"
                  >
                    {backupLoading
                      ? (backupMode === "export" ? "Exporting…" : "Importing…")
                      : (backupMode === "export" ? "Choose file & export" : "Choose file & import")}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Terminal section */}
          <div id="settings-terminal">
            <p className="text-xs font-semibold text-[#777] uppercase tracking-wider mb-3">Terminal</p>
            <p className="text-xs text-[#555] mb-3">Changes apply to new sessions.</p>

            <div className="flex items-center justify-between py-3 border-b border-[#1e1e1e]">
              <div>
                <p className="text-sm text-white font-medium">Font size</p>
              </div>
              <select
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="ml-4 bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-accent shrink-0"
              >
                {[10, 12, 13, 14, 16, 18, 20].map((n) => (
                  <option key={n} value={n}>{n}px</option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between py-3 border-b border-[#1e1e1e]">
              <div>
                <p className="text-sm text-white font-medium">Scrollback lines</p>
                <p className="text-xs text-[#777] mt-0.5">Lines retained above the viewport</p>
              </div>
              <select
                value={scrollback}
                onChange={(e) => setScrollback(Number(e.target.value))}
                className="ml-4 bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-accent shrink-0"
              >
                {[[500,"500"],[1000,"1 000"],[5000,"5 000"],[10000,"10 000"],[50000,"50 000"]].map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm text-white font-medium">Copy on select</p>
                <p className="text-xs text-[#777] mt-0.5">Automatically copy selected text to clipboard</p>
              </div>
              <button
                onClick={() => setCopyOnSelect(!copyOnSelect)}
                className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ml-4 ${
                  copyOnSelect ? "bg-accent" : "bg-[#333]"
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
          </div>

          {/* Success banner */}
          {success && (
            <p className="text-sm text-green-400 bg-green-950 border border-green-800 rounded-md px-3 py-2">
              ✓ {success}
            </p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[#1e1e1e] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-[#777] hover:text-white bg-[#1a1a1a] hover:bg-[#222] rounded transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
