import { useVaultCountdown } from "../../lib/useVaultCountdown";

export default function VaultCountdown() {
  const countdown = useVaultCountdown();
  if (!countdown) return null;
  const { urgent, warning, fmt } = countdown;

  return (
    <div className={`mx-2 mb-2 px-3 py-2 rounded-lg border text-xs flex items-center gap-2 ${
      urgent
        ? "bg-red-950/30 border-red-900/40 text-red-400"
        : warning
          ? "bg-yellow-950/30 border-yellow-900/40 text-yellow-400"
          : "bg-[#0d0d0d] border-[#1e1e1e] text-[#555]"
    }`}>
      <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.8}>
        <rect x="5" y="1" width="6" height="3" rx="1" />
        <path strokeLinecap="round" d="M3 5.5A2.5 2.5 0 015.5 3h5A2.5 2.5 0 0113 5.5v7A2.5 2.5 0 0110.5 15h-5A2.5 2.5 0 013 12.5v-7z" />
        <path strokeLinecap="round" d="M8 7v3" />
      </svg>
      <span>Locks in <span className="font-mono font-semibold">{fmt()}</span></span>
    </div>
  );
}
