import { useEffect } from "react";

interface Props {
  title: string;
  description?: string | React.ReactNode;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDeleteModal({
  title,
  description,
  confirmLabel = "Delete",
  busy,
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 animate-backdrop-in"
      onClick={onCancel}
    >
      <div
        className="bg-surface-2 border border-stroke rounded-xl shadow-overlay animate-overlay-in w-full max-w-sm mx-4 p-6 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-1">
          <h2 className="text-title text-white">{title}</h2>
          {description && <p className="text-muted text-sm">{description}</p>}
        </div>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 text-sm text-muted hover:text-white bg-surface-3 hover:bg-surface-4 rounded transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-500 rounded transition-colors disabled:opacity-40"
          >
            {busy ? `${confirmLabel}…` : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
