import { useState, useEffect } from "react";
import serverIcon from "../../assets/server.png";
import { useVaultStore } from "../../store/vaultStore";
import { formatError } from "../../lib/errors";
import Input from "../shared/Input";

export default function VaultLockScreen() {
  const unlock = useVaultStore((s) => s.unlock);
  const unlockBiometric = useVaultStore((s) => s.unlockBiometric);
  const check = useVaultStore((s) => s.check);
  const isBiometricAvailable = useVaultStore((s) => s.isBiometricAvailable);
  const isBiometricEnabled = useVaultStore((s) => s.isBiometricEnabled);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [recovering, setRecovering] = useState(false);

  const vaultNotSetUp = error?.toLowerCase().includes("vault not set up") ?? false;
  const showTouchId = isBiometricAvailable && isBiometricEnabled;

  // Auto-trigger Touch ID when the lock screen mounts and biometric is enabled.
  useEffect(() => {
    if (!showTouchId) return;
    void handleBiometric();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTouchId]);

  const handleBiometric = async () => {
    setBiometricLoading(true);
    setError(null);
    try {
      await unlockBiometric();
    } catch (e) {
      const msg = formatError(e);
      // User cancelled Touch ID — show message briefly then clear so they can
      // retry without the error feeling permanent.
      if (msg.toLowerCase().includes("cancel") || msg.toLowerCase().includes("failed")) {
        setError("Touch ID not recognised. Enter your password or try again.");
      } else {
        setError(msg);
      }
    } finally {
      setBiometricLoading(false);
    }
  };

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
      <div className="w-full max-w-sm px-6">
        <div className="text-center mb-8">
          <img src={serverIcon} alt="SSHelter" className="w-12 h-12 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-1">
            SSH<span className="text-accent">elter</span>
          </h1>
          <p className="text-muted text-sm">Enter your master password to continue</p>
        </div>

        {showTouchId && (
          <button
            onClick={() => { void handleBiometric(); }}
            disabled={biometricLoading}
            className="w-full mb-4 flex items-center justify-center gap-2.5 py-3 rounded border border-stroke bg-surface-1 hover:bg-surface-2 disabled:opacity-40 transition-colors text-sm text-white font-medium"
          >
            <TouchIdIcon className="w-5 h-5 shrink-0" />
            {biometricLoading ? "Waiting for Touch ID…" : "Unlock with Touch ID"}
          </button>
        )}

        <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-3">
          <Input
            autoFocus={!showTouchId}
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(null); }}
            placeholder="Master password"
            className="bg-surface-1 px-4"
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

        {vaultNotSetUp && (
          <div className="mt-6 p-4 bg-surface-1 border border-stroke rounded-lg text-center">
            <p className="text-xs text-muted mb-3">
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

function TouchIdIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 3.338A9.954 9.954 0 0 1 12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12c0-1.821.487-3.53 1.338-5" />
      <path d="M12 9a3 3 0 0 1 3 3c0 1.5-.8 2.8-2 3.5" />
      <path d="M9.5 10.5a4.5 4.5 0 0 0 4 7" />
      <path d="M12 6a6 6 0 0 1 6 6c0 3-1.4 5.6-3.5 7.3" />
      <path d="M6.5 8A8 8 0 0 0 6 12a8 8 0 0 0 3.5 6.7" />
    </svg>
  );
}
