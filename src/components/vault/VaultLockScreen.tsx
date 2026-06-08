import { useState } from "react";
import serverIcon from "../../assets/server.png";
import { useVaultStore } from "../../store/vaultStore";
import { formatError } from "../../lib/errors";
import Input from "../shared/Input";

export default function VaultLockScreen() {
  const unlock = useVaultStore((s) => s.unlock);
  const check = useVaultStore((s) => s.check);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const vaultNotSetUp = error?.toLowerCase().includes("vault not set up") ?? false;

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

  const handleRecheck = async () => {
    setRecovering(true);
    setError(null);
    try {
      await check();
    } finally {
      setRecovering(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center z-50">
      <div className="relative w-full max-w-sm px-6">
        <div className="text-center mb-8">
          <img src={serverIcon} alt="SSHelter" className="w-12 h-12 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-1">
            SSH<span className="text-accent">elter</span>
          </h1>
          <p className="text-muted text-sm">Enter your master password to continue</p>
        </div>

        <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-3">
          <div className="relative">
            <Input
              autoFocus
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
              placeholder="Master password"
              className="bg-surface-1 px-4 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-muted hover:text-white transition-colors"
            >
              {showPassword ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M10.584 10.587a2 2 0 002.828 2.83M9.363 5.365A9.466 9.466 0 0112 5c4.756 0 8.773 3.162 10.066 7.498a10.523 10.523 0 01-4.293 5.302M6.228 6.228A10.45 10.45 0 001.934 12.498 10.523 10.523 0 005.21 16.79m4.522-4.522l4.59 4.591" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              )}
            </button>
          </div>

          {error && <p className="text-sm text-red-400 text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full bg-accent hover:bg-accent-hover disabled:opacity-40 text-black font-semibold py-3 rounded transition-colors"
          >
            {loading ? "Unlocking…" : "Unlock"}
          </button>
        </form>

        {vaultNotSetUp && (
          <div className="mt-6 p-4 bg-surface-1 border border-stroke rounded-lg text-center">
            <p className="text-meta text-muted mb-3">
              Vault data may be missing or corrupted. You can re-check vault status to return to the setup screen.
            </p>
            <button
              onClick={() => { void handleRecheck(); }}
              disabled={recovering}
              className="text-sm text-accent hover:text-accent-hover disabled:opacity-40 transition-colors"
            >
              {recovering ? "Checking…" : "Re-check vault status"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
