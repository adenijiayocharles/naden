import type { Dispatch, SetStateAction } from "react";
import { TERMINAL_THEMES, type TerminalThemeId } from "../../../lib/terminalSettings";
import type { FormData } from "../serverFormTypes";

export function ThemeTab({
  form,
  setForm,
  setDirty,
}: {
  form: FormData;
  setForm: Dispatch<SetStateAction<FormData>>;
  setDirty: Dispatch<SetStateAction<boolean>>;
}) {
  return (
    <>
      <p className="text-xs text-muted mb-3">
        Override the global terminal colour scheme for this server. Leave on <span className="text-secondary">Global</span> to use Settings → Terminal.
      </p>
      <div className="grid grid-cols-4 gap-2">
        {[{ id: "" as const, label: "Global", bg: "#111111", fg: "#CDFF00" }, ...TERMINAL_THEMES].map(({ id, label, bg, fg }) => (
          <button
            key={id}
            type="button"
            onClick={() => { setForm((f) => ({ ...f, terminalTheme: id as TerminalThemeId | "" })); setDirty(true); }}
            title={label}
            className={`rounded-xl border-2 overflow-hidden transition-all ${
              form.terminalTheme === id ? "border-accent" : "border-transparent hover:border-stroke"
            }`}
          >
            <div className="h-14 flex items-center justify-center gap-1 px-2" style={{ backgroundColor: bg }}>
              <span className="font-mono text-[11px] leading-none select-none" style={{ color: fg }}>{">"}</span>
              <span className="inline-block w-[6px] h-[12px] rounded-[1px]" style={{ backgroundColor: fg, opacity: 0.85 }} />
            </div>
            <div className="bg-surface-2 py-1 px-2">
              <p className={`text-xs leading-tight truncate ${form.terminalTheme === id ? "text-accent-fg font-medium" : "text-secondary"}`}>{label}</p>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}
