import { useState } from "react";
import { useVaultStore } from "../../store/vaultStore";
import { formatError } from "../../lib/errors";

export default function VaultLockScreen() {
  const unlock = useVaultStore((s) => s.unlock);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError(null);
    try {
      const ok = await unlock(password);
      if (!ok) setError("Incorrect password.");
    } catch (e) {
      setError(formatError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center z-50">
      <div className="w-full max-w-sm px-6">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4 text-accent">⬡</div>
          <h1 className="text-2xl font-bold text-white mb-1">
            SSH <span className="text-accent">Manager</span>
          </h1>
          <p className="text-[#555] text-sm">Enter your master password to continue</p>
        </div>

        <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-3">
          <input
            autoFocus
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(null); }}
            placeholder="Master password"
            className="w-full bg-[#111] border border-[#2a2a2a] rounded px-4 py-3 text-white placeholder-[#444] focus:outline-none focus:border-accent transition-colors"
          />

          {error && <p className="text-sm text-red-400 text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full bg-accent hover:bg-accent-hover disabled:opacity-40 text-black font-semibold py-3 rounded transition-colors"
          >
            {loading ? "Unlocking…" : "Unlock"}
          </button>
        </form>
      </div>
    </div>
  );
}
