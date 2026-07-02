import { useState, useEffect } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { Button } from "../ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Switch } from "../ui/switch";
import { Checkbox } from "../ui/checkbox";
import ConfirmDeleteModal from "../shared/ConfirmDeleteModal";
import { useVaultStore } from "../../store/vaultStore";
import { useUiStore } from "../../store/uiStore";
import { settingsCommands, backupCommands, updaterCommands } from "../../lib/tauriCommands";
import { formatError, isAppError } from "../../lib/errors";
import { passwordStrength } from "../../lib/passwordStrength";
import { SectionHeader, Row, RowLabel, PasswordInput } from "./SettingsShared";

type ActiveForm = "none" | "disable" | "enable" | "change";

interface SecuritySettingsProps {
  initialSettings: Record<string, string>;
  flashSaved: () => void;
}

export default function SecuritySettings({ initialSettings, flashSaved }: SecuritySettingsProps) {
  const { isPasswordRequired, disablePassword, enablePassword, changePassword } = useVaultStore();
  const setVaultTimeoutMins = useUiStore((s) => s.setVaultTimeoutMins);

  const [activeForm, setActiveForm] = useState<ActiveForm>("none");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [timeoutMins, setTimeoutMins] = useState("0");
  const [autoLockNeedsPassword, setAutoLockNeedsPassword] = useState(false);

  const [disablePwd, setDisablePwd] = useState("");
  const [enablePwd, setEnablePwd] = useState("");
  const [enableConfirm, setEnableConfirm] = useState("");
  const [enableAcknowledged, setEnableAcknowledged] = useState(false);
  const [changeCurrent, setChangeCurrent] = useState("");
  const [changeNew, setChangeNew] = useState("");
  const [changeConfirm, setChangeConfirm] = useState("");

  const [backupBusy, setBackupBusy] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupSuccess, setBackupSuccess] = useState<string | null>(null);
  const [restorePendingPath, setRestorePendingPath] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (initialSettings.vault_timeout_minutes != null) {
      setTimeoutMins(initialSettings.vault_timeout_minutes);
    }
  }, [initialSettings]);

  const reset = () => {
    setError(null); setSuccess(null);
    setDisablePwd(""); setEnablePwd(""); setEnableConfirm(""); setEnableAcknowledged(false);
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
    if (!enableAcknowledged) { setError("Please confirm you understand this password can't be recovered."); return; }
    setLoading(true); setError(null);
    try {
      await enablePassword(enablePwd);
      setSuccess("Vault password enabled.");
      setActiveForm("none"); setEnablePwd(""); setEnableConfirm(""); setEnableAcknowledged(false);
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

  const handleBackup = async () => {
    setBackupBusy(true); setBackupError(null); setBackupSuccess(null);
    try {
      const destPath = await save({
        defaultPath: `naden-backup-${new Date().toISOString().slice(0, 10)}.db`,
        filters: [{ name: "naden vault backup", extensions: ["db"] }],
      });
      if (!destPath) return;
      await backupCommands.backupVaultDb(destPath);
      setBackupSuccess("Vault backed up.");
    } catch (e) {
      setBackupError(formatError(e));
    } finally {
      setBackupBusy(false);
    }
  };

  const handlePickRestoreFile = async () => {
    setBackupError(null); setBackupSuccess(null);
    const path = await open({
      multiple: false,
      title: "Choose a naden vault backup",
      filters: [{ name: "naden vault backup", extensions: ["db"] }],
    });
    if (typeof path === "string") setRestorePendingPath(path);
  };

  const confirmRestore = async () => {
    if (!restorePendingPath) return;
    setRestoring(true); setBackupError(null);
    try {
      await backupCommands.restoreVaultDb(restorePendingPath);
      await updaterCommands.relaunch();
    } catch (e) {
      // A Validation error means the backup file was bad and was caught
      // before the live vault was touched — safe to show and let the user
      // retry. Anything else means the restore got far enough to close the
      // live DB pool for the rest of this process, so relaunching is the
      // only way to recover whether the swap ultimately succeeded or not.
      if (isAppError(e) && e.kind === "Validation") {
        setBackupError(formatError(e));
        setRestoring(false);
      } else {
        setBackupError(`${formatError(e)} — restarting to recover…`);
        await updaterCommands.relaunch();
      }
    } finally {
      setRestorePendingPath(null);
    }
  };

  const { label: strengthLabel, color: strengthColor, pct: strengthPct } =
    passwordStrength(activeForm === "enable" ? enablePwd : changeNew);

  return (
    <div>
      <SectionHeader title="Security" />

      <Row>
        <RowLabel
          title="Require master password"
          description={isPasswordRequired
            ? "App is locked with a password on launch."
            : "App opens without a password. Credentials still use the OS keychain."}
        />
        <Switch
          aria-label="Require master password"
          checked={isPasswordRequired}
          onCheckedChange={handleToggle}
        />
      </Row>

      {activeForm === "disable" && (
        <div className="mt-3 mb-2 space-y-3 p-3 bg-surface-0 rounded-lg border border-stroke-subtle">
          <p className="text-xs text-secondary">Enter your current master password to disable vault protection.</p>
          <PasswordInput autoFocus value={disablePwd} onChange={setDisablePwd} placeholder="Current password" />
          {error && <p className="text-xs text-error">{error}</p>}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => openForm("none")} className="flex-1">Cancel</Button>
            <Button onClick={() => { void submitDisable(); }} disabled={loading || !disablePwd} className="flex-1 bg-red-500 hover:bg-red-400 text-black font-semibold disabled:opacity-40">
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
          <div className="rounded-lg border border-warning-subtle bg-warning-subtle px-3 py-2">
            <p className="text-xs text-warning">
              naden cannot recover this password. If you forget it, your stored credentials are permanently inaccessible.
            </p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer text-xs text-muted">
            <Checkbox
              checked={enableAcknowledged}
              onCheckedChange={(checked) => { setEnableAcknowledged(checked === true); setError(null); }}
            />
            I understand this can't be undone if I forget my password
          </label>
          {error && <p className="text-xs text-error">{error}</p>}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => openForm("none")} className="flex-1">Cancel</Button>
            <Button onClick={() => { void submitEnable(); }} disabled={loading || enablePwd.length < 8 || enablePwd !== enableConfirm || !enableAcknowledged} className="flex-1">
              {loading ? "Setting up…" : "Enable password"}
            </Button>
          </div>
        </div>
      )}

      {isPasswordRequired && (
        <div>
          <Button
            variant="ghost"
            onClick={() => openForm(activeForm === "change" ? "none" : "change")}
            className="w-full justify-between text-left py-3 h-auto text-sm text-secondary hover:text-white rounded-none border-b border-stroke-subtle"
          >
            <span>Change master password</span>
            <svg className={`w-3.5 h-3.5 text-muted transition-transform ${activeForm === "change" ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </Button>
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
                <Button variant="secondary" onClick={() => openForm("none")} className="flex-1">Cancel</Button>
                <Button onClick={() => { void submitChange(); }} disabled={loading || !changeCurrent || changeNew.length < 8 || changeNew !== changeConfirm} className="flex-1">
                  {loading ? "Updating…" : "Change password"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <Row>
        <RowLabel title="Auto-lock vault" description="Lock after this many minutes of inactivity (0 = never)" />
        <Select
          value={timeoutMins}
          onValueChange={saveTimeout}
          disabled={!isPasswordRequired && timeoutMins === "0"}
        >
          <SelectTrigger className="h-10 shrink-0">
            <SelectValue>
              {(val) => ({"0":"Never","5":"5 min","15":"15 min","30":"30 min","60":"1 hour","120":"2 hours"} as Record<string,string>)[String(val)] ?? String(val)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {[["0","Never"],["5","5 min"],["15","15 min"],["30","30 min"],["60","1 hour"],["120","2 hours"]].map(([v, l]) => (
              <SelectItem key={v} value={v!} label={l}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      {autoLockNeedsPassword && (
        <div className="mb-3 flex items-center justify-between gap-3 bg-warning-subtle border border-warning-subtle rounded-lg px-3 py-2">
          <p className="text-xs text-warning">A master password is required to use auto-lock.</p>
          <Button variant="ghost" onClick={() => { setAutoLockNeedsPassword(false); openForm("enable"); }} className="h-auto px-0 text-xs text-accent hover:text-accent-hover hover:bg-transparent shrink-0">
            Set password →
          </Button>
        </div>
      )}

      {success && (
        <p className="text-sm text-success bg-success-subtle border border-success-subtle rounded-md px-3 py-2 mt-4">
          ✓ {success}
        </p>
      )}

      <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3 mt-6">Backup &amp; restore</p>
      <p className="text-xs text-text-muted mb-3">
        Backups are encrypted with your master password (AES-256-GCM). Security depends entirely on password strength — use a long passphrase, not a short word.
      </p>
      <Row>
        <RowLabel
          title="Back up vault"
          description="Save an encrypted copy of all servers and credentials to a file"
        />
        <Button variant="secondary" onClick={() => { void handleBackup(); }} disabled={backupBusy} className="h-8">
          {backupBusy ? "Backing up…" : "Back up…"}
        </Button>
      </Row>
      <Row>
        <RowLabel
          title="Restore vault"
          description="Replace everything with a previous backup. The app restarts afterward."
        />
        <Button variant="secondary" onClick={() => { void handlePickRestoreFile(); }} className="h-8">
          Restore…
        </Button>
      </Row>
      {backupError && (
        <p className="text-sm text-error bg-error-subtle border border-error-subtle rounded-md px-3 py-2 mt-2">
          {backupError}
        </p>
      )}
      {backupSuccess && (
        <p className="text-sm text-success bg-success-subtle border border-success-subtle rounded-md px-3 py-2 mt-2">
          ✓ {backupSuccess}
        </p>
      )}

      {restorePendingPath && (
        <ConfirmDeleteModal
          title="Restore vault from backup?"
          description="This replaces every saved server and credential with the contents of the backup file, and the app restarts immediately. This cannot be undone."
          confirmLabel="Restore & restart"
          busy={restoring}
          onConfirm={() => { void confirmRestore(); }}
          onCancel={() => setRestorePendingPath(null)}
        />
      )}
    </div>
  );
}
