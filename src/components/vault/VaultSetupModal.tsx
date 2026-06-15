import { useState } from "react";
import { useVaultStore } from "../../store/vaultStore";
import { formatError } from "../../lib/errors";
import { passwordStrength } from "../../lib/passwordStrength";
import { Input } from "../ui/input";
import { Button } from "../ui/button";

export default function VaultSetupModal() {
  const { setup, skipSetup } = useVaultStore();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const { label, color, pct } = passwordStrength(password);

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setLoading(true);
    setError(null);
    try {
      await setup(password);
    } catch (e) {
      setError(formatError(e));
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    setSkipping(true);
    setError(null);
    try {
      await skipSetup();
    } catch (e) {
      setError(formatError(e));
      setSkipping(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center z-50 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4 text-accent">⬡</div>
          <h1 className="text-2xl font-bold text-white mb-1">
            SSH<span className="text-accent">elter</span>
          </h1>
          <p className="text-muted text-sm">Set a master password to protect your stored credentials.</p>
        </div>

        <form onSubmit={(e) => { void handleSetup(e); }} className="space-y-3">
          <div>
            <Input
              autoFocus
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
              placeholder="Master password"
              className="bg-surface-1 px-4"
            />
            {password.length > 0 && (
              <div className="mt-1.5 flex items-center gap-2">
                <div className="flex-1 h-1 bg-surface-4 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${color}`} style={{ width: pct }} />
                </div>
                <span className="text-meta text-muted w-16 text-right">{label}</span>
              </div>
            )}
          </div>

          <Input
            type="password"
            value={confirm}
            onChange={(e) => { setConfirm(e.target.value); setError(null); }}
            placeholder="Confirm password"
            className="bg-surface-1 px-4"
          />

          {error && <p className="text-sm text-error text-center">{error}</p>}

          <Button
            type="submit"
            disabled={loading || skipping || password.length < 8 || password !== confirm}
            className="w-full h-10"
          >
            {loading ? "Setting up…" : "Set up vault"}
          </Button>
        </form>

        <div className="mt-4 text-center">
          <Button
            variant="ghost"
            onClick={() => { void handleSkip(); }}
            disabled={loading || skipping}
            className="text-faint hover:text-muted"
          >
            {skipping ? "Skipping…" : "Continue without password protection"}
          </Button>
          <p className="text-meta text-dim mt-1">
            You can enable a master password anytime in Settings.
          </p>
        </div>
      </div>
    </div>
  );
}
