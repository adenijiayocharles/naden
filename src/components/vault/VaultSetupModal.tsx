import { useState } from "react";
import { useVaultStore } from "../../store/vaultStore";
import { formatError } from "../../lib/errors";

function strength(pwd: string): { label: string; color: string; width: string } {
  if (pwd.length === 0)  return { label: "",          color: "bg-surface-4",     width: "w-0" };
  if (pwd.length < 8)   return { label: "Too short",  color: "bg-red-500",    width: "w-1/4" };
  if (pwd.length < 12)  return { label: "Weak",       color: "bg-orange-500", width: "w-2/4" };
  if (pwd.length < 16)  return { label: "Moderate",   color: "bg-yellow-400", width: "w-3/4" };
  return                       { label: "Strong",     color: "bg-accent",     width: "w-full" };
}

export default function VaultSetupModal() {
  const { setup, skipSetup } = useVaultStore();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const { label, color, width } = strength(password);

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
            SSH <span className="text-accent">Manager</span>
          </h1>
          <p className="text-muted text-sm">Set a master password to protect your stored credentials.</p>
        </div>

        <form onSubmit={(e) => { void handleSetup(e); }} className="space-y-3">
          <div>
            <input
              autoFocus
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
              placeholder="Master password"
              className="w-full h-8 bg-surface-1 border border-stroke rounded px-4 text-sm text-white placeholder-faint focus:outline-none focus:border-accent transition-colors"
            />
            {password.length > 0 && (
              <div className="mt-1.5 flex items-center gap-2">
                <div className="flex-1 h-1 bg-surface-4 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${color} ${width}`} />
                </div>
                <span className="text-xs text-muted w-16 text-right">{label}</span>
              </div>
            )}
          </div>

          <input
            type="password"
            value={confirm}
            onChange={(e) => { setConfirm(e.target.value); setError(null); }}
            placeholder="Confirm password"
            className="w-full h-8 bg-surface-1 border border-stroke rounded px-4 text-sm text-white placeholder-faint focus:outline-none focus:border-accent transition-colors"
          />

          {error && <p className="text-sm text-red-400 text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading || skipping || password.length < 8 || password !== confirm}
            className="w-full bg-accent hover:bg-accent-hover disabled:opacity-40 text-black font-semibold py-3 rounded transition-colors"
          >
            {loading ? "Setting up…" : "Set up vault"}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            onClick={() => { void handleSkip(); }}
            disabled={loading || skipping}
            className="text-sm text-faint hover:text-muted disabled:opacity-40 transition-colors"
          >
            {skipping ? "Skipping…" : "Continue without password protection"}
          </button>
          <p className="text-xs text-dim mt-1">
            You can enable a master password anytime in Settings.
          </p>
        </div>
      </div>
    </div>
  );
}
