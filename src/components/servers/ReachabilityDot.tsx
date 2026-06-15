import { useServerStore } from "../../store/serverStore";

interface ReachabilityDotProps {
  serverId: string;
}

export function ReachabilityDot({ serverId }: ReachabilityDotProps) {
  const info = useServerStore((s) => s.reachability[serverId]);
  if (!info) return null;
  if (info.checking) {
    return <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse shrink-0" title="Checking…" />;
  }
  return (
    <span
      className={`w-1.5 h-1.5 rounded-full shrink-0 ${info.reachable ? "bg-green-500" : "bg-red-500"}`}
      title={info.reachable ? `Reachable${info.latencyMs != null ? ` (${info.latencyMs}ms)` : ""}` : "Unreachable"}
    />
  );
}
