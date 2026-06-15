import { useState } from "react";
import { XIcon } from "lucide-react";
import serverIcon from "../../assets/server.png";
import { useVaultStore } from "../../store/vaultStore";
import { useUiStore } from "../../store/uiStore";
import { settingsCommands } from "../../lib/tauriCommands";
import { formatError } from "../../lib/errors";
import SshConfigImport from "../servers/SshConfigImport";
import DiscoverHosts from "../servers/DiscoverHosts";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Progress } from "../ui/progress";
import { Checkbox } from "../ui/checkbox";

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
  const [showDiscover, setShowDiscover] = useState(false);

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

  if (showDiscover) {
    return <DiscoverHosts onClose={() => { setShowDiscover(false); advance(); }} />;
  }

  return (
    <div className="fixed inset-0 bg-black/80 animate-backdrop-in flex items-center justify-center z-50 p-4">
      <div className="relative bg-surface-1 border border-stroke-subtle rounded-xl shadow-overlay animate-overlay-in w-full max-w-md flex flex-col">
        {step === "import" && (
          <button
            type="button"
            onClick={advance}
            aria-label="Close"
            className="absolute top-4 right-4 rounded text-muted opacity-70 transition-opacity hover:opacity-100 hover:text-white"
          >
            <XIcon className="size-4" />
          </button>
        )}
        {/* Progress bar */}
        <Progress
          value={progress}
          className="gap-0 [&>[data-slot=progress-track]]:h-1 [&>[data-slot=progress-track]]:rounded-none [&>[data-slot=progress-track]]:rounded-t-xl [&>[data-slot=progress-track]]:bg-surface-4 [&_[data-slot=progress-indicator]]:duration-300"
        />

        <div className="px-8 py-7 flex-1">
          {/* ── Welcome ────────────────────────────────────────────── */}
          {step === "welcome" && (
            <div className="text-center space-y-4">
              <div className="flex justify-center mb-2">
                <img src={serverIcon} alt="naden" className="w-12 h-12" />
              </div>
              <h1 className="text-2xl font-bold text-white">Welcome to naden</h1>
              <p className="text-muted text-sm leading-relaxed">
                A fast, secure desktop app for managing all your SSH connections.
                Let's get you set up in a minute.
              </p>
              <Button onClick={advance} className="w-full mt-4 h-10">
                Get started
              </Button>
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
                    <Input
                      autoFocus
                      type="password"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setVaultError(null); }}
                      placeholder="Master password"
                    />
                    {password.length > 0 && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="flex-1 h-1 bg-surface-4 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${strengthColor}`} style={{ width: strengthPct }} />
                        </div>
                        <span className="text-meta text-faint w-16 text-right">{strengthLabel}</span>
                      </div>
                    )}
                  </div>
                  <Input
                    type="password"
                    value={confirm}
                    onChange={(e) => { setConfirm(e.target.value); setVaultError(null); }}
                    placeholder="Confirm password"
                  />
                  {vaultError && <p className="text-xs text-error">{vaultError}</p>}
                </div>
              ) : (
                <div className="p-3 bg-surface-0 border border-stroke-subtle rounded-lg text-sm text-muted">
                  {isSetup ? "✓ Vault is already protected with a master password." : "Vault protection skipped — you can enable it anytime in Settings."}
                </div>
              )}

              {!isSetup && (
                <label className="flex items-center gap-2 cursor-pointer text-sm text-muted">
                  <Checkbox
                    checked={skipVault}
                    onCheckedChange={(checked) => setSkipVault(checked === true)}
                  />
                  Skip for now
                </label>
              )}

              <div className="flex gap-2 pt-2">
                <Button variant="ghost" onClick={() => setStep("welcome")} className="text-faint">
                  Back
                </Button>
                <Button
                  onClick={() => { void handleVaultNext(); }}
                  disabled={vaultLoading || (!skipVault && !isSetup && (password.length < 8 || password !== confirm))}
                  className="flex-1 h-9"
                >
                  {vaultLoading ? "Setting up…" : "Continue"}
                </Button>
              </div>
            </div>
          )}

          {/* ── SSH Config Import ───────────────────────────────────── */}
          {step === "import" && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">Import existing servers</h2>
              <p className="text-sm text-muted">
                If you have servers configured in <code className="text-accent-fg">~/.ssh/config</code>, you can import them now. You can also do this later from the toolbar.
              </p>
              <p className="text-sm text-muted">
                Or discover hosts already in <code className="text-accent-fg">~/.ssh/known_hosts</code> or on your local network.
              </p>
              <div className="space-y-2 pt-2">
                <div className="flex gap-2">
                  <Button onClick={() => setShowImport(true)} className="flex-1 h-9">
                    Import SSH config
                  </Button>
                  <Button variant="secondary" onClick={() => setShowDiscover(true)} className="flex-1 h-9 border border-stroke">
                    Discover hosts
                  </Button>
                </div>
                <div className="flex justify-center">
                  <Button variant="ghost" onClick={() => setStep("vault")} className="text-faint">
                    Back
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ── Done ───────────────────────────────────────────────── */}
          {step === "done" && (
            <div className="text-center space-y-4">
              <div className="flex justify-center mb-2">
                <img src={serverIcon} alt="naden" className="w-12 h-12" />
              </div>
              <h2 className="text-xl font-bold text-white">You're all set!</h2>
              <p className="text-sm text-muted">
                Click a card to open a terminal, or use the <span className="text-white">+ Add Server</span> button to add your first server.
              </p>
              <div className="flex gap-2 pt-2">
                <Button
                  variant="secondary"
                  onClick={() => { void handleFinish(); openAdd(); }}
                  className="flex-1 h-9 border border-stroke"
                >
                  Add first server
                </Button>
                <Button onClick={() => { void handleFinish(); }} className="flex-1 h-9">
                  Go to app
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
