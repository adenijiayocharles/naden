import React from "react";

interface Props {
  target: { path: string; mode: number } | null;
  mode: number;
  disabled: boolean;
  onModeChange: (mode: number) => void;
  onApply: () => void;
  onCancel: () => void;
}

export default function ChmodDialog({ target, mode, disabled, onModeChange, onApply, onCancel }: Props) {
  if (!target) return null;

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/85">
      <div className="bg-surface-1 border border-stroke-subtle rounded-lg shadow-overlay animate-overlay-in w-80 p-5 flex flex-col gap-4">
        <div>
          <h3 className="text-title text-white">Change Permissions</h3>
          <p className="text-meta text-faint mt-0.5 font-mono truncate">{target.path}</p>
        </div>

        {/* Permission checkboxes */}
        <div className="grid grid-cols-4 gap-y-2 text-xs">
          <div /> {/* spacer */}
          {["Owner", "Group", "Other"].map((label) => (
            <div key={label} className="text-center text-faint font-medium">{label}</div>
          ))}
          {(["r", "w", "x"] as const).map((bit, row) => {
            const shifts = [6, 3, 0]; // owner, group, other offsets
            return (
              <React.Fragment key={bit}>
                <div className="text-muted font-mono pr-2">{bit}</div>
                {shifts.map((shift) => {
                  const mask = 1 << (shift + (2 - row));
                  const checked = (mode & mask) !== 0;
                  return (
                    <div key={`${bit}-${shift}`} className="flex justify-center">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onModeChange(checked ? mode & ~mask : mode | mask)}
                        className="w-3.5 h-3.5 accent-accent"
                      />
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>

        {/* Octal display */}
        <div className="text-xs text-center">
          <span className="text-faint">Octal: </span>
          <span className="font-mono text-white">
            {mode.toString(8).padStart(4, "0")}
          </span>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs text-muted hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onApply}
            disabled={disabled}
            className="px-3 py-1.5 bg-accent hover:bg-accent/80 text-black rounded text-xs font-medium transition-colors disabled:opacity-50"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
