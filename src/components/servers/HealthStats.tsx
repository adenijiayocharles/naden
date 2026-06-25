interface HealthStatsProps {
  cpu: number | null;
  mem: number | null;
  disk: number | null;
}

function barColor(pct: number) {
  if (pct > 80) return "bg-red-500/80";
  if (pct > 60) return "bg-amber-500/80";
  return "bg-emerald-500/80";
}

function textColor(pct: number) {
  if (pct > 80) return "text-red-400";
  if (pct > 60) return "text-amber-400";
  return "text-emerald-400";
}

function StatBar({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] text-dim font-mono w-5">{label}</span>
      <div className="w-10 h-1 bg-surface-3 rounded-full overflow-hidden">
        {value !== null && (
          <div
            className={`h-full rounded-full ${barColor(value)}`}
            style={{ width: `${Math.min(value, 100)}%` }}
          />
        )}
      </div>
      <span className={`text-[10px] font-mono tabular-nums ${value !== null ? textColor(value) : "text-dim"}`}>
        {value !== null ? `${value}%` : "—"}
      </span>
    </div>
  );
}

export function HealthStats({ cpu, mem, disk }: HealthStatsProps) {
  return (
    <div className="flex flex-col gap-1">
      <StatBar label="cpu" value={cpu} />
      <StatBar label="mem" value={mem} />
      <StatBar label="dsk" value={disk} />
    </div>
  );
}

export function HealthStatsInline({ cpu, mem, disk }: HealthStatsProps) {
  return (
    <div className="hidden lg:flex items-center gap-2.5 shrink-0">
      {(
        [
          ["cpu", cpu],
          ["mem", mem],
          ["dsk", disk],
        ] as [string, number | null][]
      ).map(([label, value]) => (
        <span
          key={label}
          className={`text-[10px] font-mono tabular-nums ${value !== null ? textColor(value) : "text-dim"}`}
        >
          {label} {value !== null ? `${value}%` : "—"}
        </span>
      ))}
    </div>
  );
}
