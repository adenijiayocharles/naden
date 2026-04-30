import { useState } from "react";
import { useVaultStore } from "../../store/vaultStore";
import { formatError } from "../../lib/errors";

function strength(pwd: string): { label: string; color: string; width: string } {
  if (pwd.length === 0)  return { label: "",         color: "bg-gray-700", width: "w-0" };
  if (pwd.length < 8)   return { label: "Too short", color: "bg-red-500",  width: "w-1/4" };
  if (pwd.length < 12)  return { label: "Weak",      color: "bg-orange-500", width: "w-2/4" };
  if (pwd.length < 16)  return { label: "Moderate",  color: "bg-yellow-500", width: "w-3/4" };
  return                       { label: "Strong",    color: "bg-green-500",  width: "w-full" };
}

export default function VaultSetupModal() {
  const { setup, dismissSetup } = useVaultStore();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
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

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-md p-6">
        <div className="text-center mb-6">
          <div className="text-3xl mb-2">🔐</div>
          <h2 className="text-xl font-bold text-white mb-1">Set up your vault</h2>
          <p className="text-gray-400 text-sm">
            Your vault encrypts SSH credentials stored on this machine.
            Choose a strong master password — it cannot be recovered if lost.
          </p>
        </div>

        <form onSubmit={(e) => { void handleSetup(e); }} className="space-y-3">
          <div>
            <input
              autoFocus
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
              placeholder="Master password"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
            {password.length > 0 && (
              <div className="mt-1.5 flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${color} ${width}`} />
                </div>
                <span className="text-xs text-gray-400 w-16 text-right">{label}</span>
              </div>
            )}
          </div>

          <input
            type="password"
            value={confirm}
            onChange={(e) => { setConfirm(e.target.value); setError(null); }}
            placeholder="Confirm password"
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
          />

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={dismissSetup}
              className="flex-1 py-2.5 text-sm text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
            >
              Maybe later
            </button>
            <button
              type="submit"
              disabled={loading || password.length < 8 || password !== confirm}
              className="flex-1 py-2.5 text-sm text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg transition-colors font-medium"
            >
              {loading ? "Setting up…" : "Set up vault"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
