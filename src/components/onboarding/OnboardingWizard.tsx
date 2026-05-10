import { useState } from "react";
import { useVaultStore } from "../../store/vaultStore";
import { useUiStore } from "../../store/uiStore";
import { settingsCommands } from "../../lib/tauriCommands";
import { formatError } from "../../lib/errors";
import SshConfigImport from "../servers/SshConfigImport";

interface Props {
  onComplete: () => void;
}

type Step = "welcome" | "vault" | "import" | "done";

function strength(pwd: string) {
  if (pwd.length === 0)  return { label: "",         color: "bg-surface-4",      pct: "0%" };
  if (pwd.length < 8)   return { label: "Too short", color: "bg-red-500",     pct: "25%" };
  if (pwd.length < 12)  return { label: "Weak",      color: "bg-orange-500",  pct: "50%" };
  if (pwd.length < 16)  return { label: "Moderate",  color: "bg-yellow-400",  pct: "75%" };
  return                       { label: "Strong",    color: "bg-accent",      pct: "100%" };
}

const STEPS: Step[] = ["welcome", "vault", "import", "done"];

export default function OnboardingWizard({ onComplete }: Props) {
  const [step, setStep] = useState<Step>("welcome");
  const [showImport, setShowImport] = useState(false);

  // Vault step state
  const { setup, isSetup } = useVaultStore();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [skipVault, setSkipVault] = useState(false);
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [vaultLoading, setVaultLoading] = useState(false);

  const openAdd = useUiStore((s) => s.openAdd);

  const { label: strengthLabel, color: strengthColor, pct: strengthPct } = strength(password);

  const stepIndex = STEPS.indexOf(step);
  const progress = ((stepIndex + 1) / STEPS.length) * 100;

  const advance = () => {
    const next = STEPS[stepIndex + 1];
    if (next) setStep(next);
  };

  const handleVaultNext = async () => {
    if (skipVault || isSetup) { advance(); return; }
    if (password !== confirm) { setVaultError("Passwords don't match."); return; }
    if (password.length < 8) { setVaultError("Password must be at least 8 characters."); return; }
    setVaultLoading(true);
    setVaultError(null);
    try {
      await setup(password);
      advance();
    } catch (e) {
      setVaultError(formatError(e));
    } finally {
      setVaultLoading(false);
    }
  };

  const handleFinish = async () => {
    await settingsCommands.setSetting("onboarding_complete", "true");
    onComplete();
  };

  if (showImport) {
    return <SshConfigImport onClose={() => { setShowImport(false); advance(); }} />;
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-1 border border-stroke-subtle rounded-xl shadow-2xl w-full max-w-md flex flex-col">
        {/* Progress bar */}
        <div className="h-1 bg-surface-4 rounded-t-xl overflow-hidden">
          <div
            className="h-full bg-accent transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="px-8 py-7 flex-1">
          {/* ── Welcome ────────────────────────────────────────────── */}
          {step === "welcome" && (
            <div className="text-center space-y-4">
              <div className="text-4xl mb-2">🔑</div>
              <h1 className="text-2xl font-bold text-white">Welcome to SSH Manager</h1>
              <p className="text-muted text-sm leading-relaxed">
                A fast, secure desktop app for managing all your SSH connections.
                Let's get you set up in a minute.
              </p>
              <button
                onClick={advance}
                className="w-full mt-4 py-2.5 bg-accent hover:bg-accent-hover text-black font-semibold rounded transition-colors"
              >
                Get started
              </button>
            </div>
          )}

          {/* ── Vault setup ────────────────────────────────────────── */}
          {step === "vault" && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">Secure your credentials</h2>
              <p className="text-sm text-muted">
                Set a master password to protect stored SSH passwords and key passphrases.
                You can skip this and enable it later in Settings.
              </p>

              {!skipVault && !isSetup ? (
                <div className="space-y-3">
                  <div>
                    <input
                      autoFocus
                      type="password"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setVaultError(null); }}
                      placeholder="Master password"
                      className="w-full h-8 bg-surface-3 border border-stroke rounded px-3 text-sm text-white placeholder-faint focus:outline-none focus:border-accent"
                    />
                    {password.length > 0 && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="flex-1 h-1 bg-surface-4 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${strengthColor}`} style={{ width: strengthPct }} />
                        </div>
                        <span className="text-xs text-faint w-16 text-right">{strengthLabel}</span>
                      </div>
                    )}
                  </div>
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => { setConfirm(e.target.value); setVaultError(null); }}
                    placeholder="Confirm password"
                    className="w-full h-8 bg-surface-3 border border-stroke rounded px-3 text-sm text-white placeholder-faint focus:outline-none focus:border-accent"
                  />
                  {vaultError && <p className="text-xs text-red-400">{vaultError}</p>}
                </div>
              ) : (
                <div className="p-3 bg-surface-0 border border-stroke-subtle rounded-lg text-sm text-muted">
                  {isSetup ? "✓ Vault is already protected with a master password." : "Vault protection skipped — you can enable it anytime in Settings."}
                </div>
              )}

              {!isSetup && (
                <label className="flex items-center gap-2 cursor-pointer text-sm text-muted">
                  <input
                    type="checkbox"
                    checked={skipVault}
                    onChange={(e) => setSkipVault(e.target.checked)}
                    className="rounded border-stroke"
                  />
                  Skip for now
                </label>
              )}

              <div className="flex gap-2 pt-2">
                <button onClick={() => setStep("welcome")} className="px-4 py-2 text-sm text-faint hover:text-white transition-colors">
                  Back
                </button>
                <button
                  onClick={() => { void handleVaultNext(); }}
                  disabled={vaultLoading || (!skipVault && !isSetup && (password.length < 8 || password !== confirm))}
                  className="flex-1 py-2 bg-accent hover:bg-accent-hover disabled:opacity-40 text-black font-semibold rounded transition-colors text-sm"
                >
                  {vaultLoading ? "Setting up…" : "Continue"}
                </button>
              </div>
            </div>
          )}

          {/* ── SSH Config Import ───────────────────────────────────── */}
          {step === "import" && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">Import existing servers</h2>
              <p className="text-sm text-muted">
                If you have servers configured in <code className="text-accent">~/.ssh/config</code>, you can import them now. You can also do this later from the toolbar.
              </p>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setStep("vault")} className="px-4 py-2 text-sm text-faint hover:text-white transition-colors">
                  Back
                </button>
                <button
                  onClick={() => setShowImport(true)}
                  className="flex-1 py-2 bg-surface-3 hover:bg-surface-4 border border-stroke text-secondary text-sm rounded transition-colors"
                >
                  Import SSH config
                </button>
                <button
                  onClick={advance}
                  className="flex-1 py-2 bg-accent hover:bg-accent-hover text-black font-semibold rounded transition-colors text-sm"
                >
                  Skip
                </button>
              </div>
            </div>
          )}

          {/* ── Done ───────────────────────────────────────────────── */}
          {step === "done" && (
            <div className="text-center space-y-4">
              <div className="text-4xl mb-2">✅</div>
              <h2 className="text-xl font-bold text-white">You're all set!</h2>
              <p className="text-sm text-muted">
                Click a card to open a terminal, or use the <span className="text-white">+ Add Server</span> button to add your first server.
              </p>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => { void handleFinish(); openAdd(); }}
                  className="flex-1 py-2 bg-surface-3 hover:bg-surface-4 border border-stroke text-secondary text-sm rounded transition-colors"
                >
                  Add first server
                </button>
                <button
                  onClick={() => { void handleFinish(); }}
                  className="flex-1 py-2 bg-accent hover:bg-accent-hover text-black font-semibold rounded transition-colors text-sm"
                >
                  Go to app
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
