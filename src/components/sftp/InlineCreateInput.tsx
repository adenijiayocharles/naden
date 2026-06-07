import { useEffect, useRef } from "react";

interface Props {
  label: string;
  placeholder: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}

export default function InlineCreateInput({ label, placeholder, onCommit, onCancel }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);

  return (
    <div className="px-4 py-2 bg-surface-1 border-b border-stroke-subtle flex items-center gap-2 shrink-0">
      <span className="text-meta text-muted">{label}</span>
      <input
        ref={ref}
        defaultValue=""
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit((e.target as HTMLInputElement).value.trim());
          if (e.key === "Escape") onCancel();
        }}
        placeholder={placeholder}
        className="flex-1 bg-surface-3 border border-[#333] rounded px-2 py-1 text-sm text-white outline-none focus:border-accent font-mono placeholder-[#444]"
      />
      <button onClick={() => onCommit(ref.current?.value.trim() ?? "")} className="text-xs text-accent-fg px-2">Create</button>
      <button onClick={onCancel} className="text-xs text-faint px-2">Cancel</button>
    </div>
  );
}
