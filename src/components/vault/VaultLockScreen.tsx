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
      <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
        <svg
          viewBox="0 0 1440 900"
          preserveAspectRatio="xMidYMid slice"
          className="w-full h-full"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <filter id="vl-blur" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="18" />
            </filter>
            <radialGradient id="vl-vignette" cx="720" cy="450" r="800" gradientUnits="userSpaceOnUse">
              <stop offset="30%" stopColor="#000000" stopOpacity="0" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.55" />
            </radialGradient>
          </defs>

          {/* Glow orbs behind the four hub nodes */}
          <circle cx="180"  cy="72"  r="70" fill="#CDFF00" fillOpacity="0.18" filter="url(#vl-blur)" />
          <circle cx="1260" cy="72"  r="70" fill="#CDFF00" fillOpacity="0.18" filter="url(#vl-blur)" />
          <circle cx="155"  cy="380" r="80" fill="#CDFF00" fillOpacity="0.15" filter="url(#vl-blur)" />
          <circle cx="1285" cy="380" r="80" fill="#CDFF00" fillOpacity="0.15" filter="url(#vl-blur)" />

          {/* ── Edges ── */}
          <g stroke="#CDFF00" fill="none" strokeWidth="0.75">
            {/* Top strip */}
            <line x1="180"  y1="72"  x2="420"  y2="48"  strokeOpacity="0.18" />
            <line x1="420"  y1="48"  x2="620"  y2="95"  strokeOpacity="0.16" />
            <line x1="620"  y1="95"  x2="820"  y2="95"  strokeOpacity="0.14" />
            <line x1="820"  y1="95"  x2="1020" y2="48"  strokeOpacity="0.16" />
            <line x1="1020" y1="48"  x2="1260" y2="72"  strokeOpacity="0.18" />
            {/* Top → left/right */}
            <line x1="180"  y1="72"  x2="72"   y2="220" strokeOpacity="0.18" />
            <line x1="1260" y1="72"  x2="1368" y2="220" strokeOpacity="0.18" />
            {/* Left edge */}
            <line x1="72"   y1="220" x2="155"  y2="380" strokeOpacity="0.20" />
            <line x1="155"  y1="380" x2="68"   y2="520" strokeOpacity="0.18" />
            <line x1="68"   y1="520" x2="180"  y2="650" strokeOpacity="0.16" />
            <line x1="180"  y1="650" x2="280"  y2="780" strokeOpacity="0.15" />
            {/* Right edge */}
            <line x1="1368" y1="220" x2="1285" y2="380" strokeOpacity="0.20" />
            <line x1="1285" y1="380" x2="1372" y2="520" strokeOpacity="0.18" />
            <line x1="1372" y1="520" x2="1260" y2="650" strokeOpacity="0.16" />
            <line x1="1260" y1="650" x2="1160" y2="780" strokeOpacity="0.15" />
            {/* Bottom strip */}
            <line x1="280"  y1="780" x2="520"  y2="830" strokeOpacity="0.14" />
            <line x1="520"  y1="830" x2="720"  y2="848" strokeOpacity="0.13" />
            <line x1="720"  y1="848" x2="920"  y2="830" strokeOpacity="0.13" />
            <line x1="920"  y1="830" x2="1160" y2="780" strokeOpacity="0.14" />
            {/* Interior diagonals */}
            <line x1="72"   y1="220" x2="320"  y2="268" strokeOpacity="0.12" />
            <line x1="620"  y1="95"  x2="320"  y2="268" strokeOpacity="0.12" />
            <line x1="155"  y1="380" x2="420"  y2="440" strokeOpacity="0.14" />
            <line x1="1368" y1="220" x2="1020" y2="268" strokeOpacity="0.12" />
            <line x1="820"  y1="95"  x2="1020" y2="268" strokeOpacity="0.12" />
            <line x1="1285" y1="380" x2="1020" y2="440" strokeOpacity="0.14" />
            {/* Long diagonals crossing toward centre */}
            <line x1="420"  y1="440" x2="520"  y2="830" strokeOpacity="0.08" />
            <line x1="1020" y1="440" x2="920"  y2="830" strokeOpacity="0.08" />
          </g>

          {/* ── Nodes ── */}
          <g fill="#CDFF00">
            {/* Top strip */}
            <circle cx="180"  cy="72"  r="4"   fillOpacity="0.55" />
            <circle cx="420"  cy="48"  r="2"   fillOpacity="0.35" />
            <circle cx="620"  cy="95"  r="2.5" fillOpacity="0.32" />
            <circle cx="820"  cy="95"  r="2.5" fillOpacity="0.32" />
            <circle cx="1020" cy="48"  r="2"   fillOpacity="0.35" />
            <circle cx="1260" cy="72"  r="4"   fillOpacity="0.55" />
            {/* Left edge */}
            <circle cx="72"   cy="220" r="2.5" fillOpacity="0.35" />
            <circle cx="155"  cy="380" r="5"   fillOpacity="0.55" />
            <circle cx="68"   cy="520" r="2"   fillOpacity="0.28" />
            <circle cx="180"  cy="650" r="3"   fillOpacity="0.32" />
            {/* Right edge */}
            <circle cx="1368" cy="220" r="2.5" fillOpacity="0.35" />
            <circle cx="1285" cy="380" r="5"   fillOpacity="0.55" />
            <circle cx="1372" cy="520" r="2"   fillOpacity="0.28" />
            <circle cx="1260" cy="650" r="3"   fillOpacity="0.32" />
            {/* Bottom strip */}
            <circle cx="280"  cy="780" r="2.5" fillOpacity="0.30" />
            <circle cx="520"  cy="830" r="2"   fillOpacity="0.26" />
            <circle cx="720"  cy="848" r="3"   fillOpacity="0.28" />
            <circle cx="920"  cy="830" r="2"   fillOpacity="0.26" />
            <circle cx="1160" cy="780" r="2.5" fillOpacity="0.30" />
            {/* Interior */}
            <circle cx="320"  cy="268" r="2"   fillOpacity="0.28" />
            <circle cx="420"  cy="440" r="2.5" fillOpacity="0.28" />
            <circle cx="1020" cy="268" r="2"   fillOpacity="0.28" />
            <circle cx="1020" cy="440" r="2.5" fillOpacity="0.28" />
          </g>

          {/* Vignette — darkens edges, keeps eye on the centre form */}
          <rect width="1440" height="900" fill="url(#vl-vignette)" />
        </svg>
      </div>

      <div className="relative w-full max-w-sm px-6">
        <div className="text-center mb-8">
          <img src={serverIcon} alt="SSHelter" className="w-12 h-12 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-1">
            SSH<span className="text-accent">elter</span>
          </h1>
          <p className="text-muted text-sm">Enter your master password to continue</p>
        </div>

        <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-3">
          <Input
            autoFocus
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
