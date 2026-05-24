interface Props {
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DeleteConfirmBanner({ count, onConfirm, onCancel }: Props) {
  return (
    <div className="px-4 py-2 bg-red-950/30 border-b border-red-900/40 flex items-center gap-3 text-xs shrink-0">
      <span className="text-red-300 flex-1">
        Delete <span className="font-semibold">{count} item{count > 1 ? "s" : ""}</span>? This cannot be undone.
      </span>
      <button onClick={onConfirm} className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white rounded transition-colors font-semibold">
        Delete
      </button>
      <button onClick={onCancel} className="text-faint hover:text-white transition-colors">
        Cancel
      </button>
    </div>
  );
}
