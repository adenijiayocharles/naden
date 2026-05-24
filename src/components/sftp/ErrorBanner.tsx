interface Props {
  error: string;
  onDismiss: () => void;
}

export default function ErrorBanner({ error, onDismiss }: Props) {
  return (
    <div className="px-4 py-2 bg-red-950/40 border-b border-red-900/50 text-xs text-red-400 flex items-center justify-between shrink-0">
      {error}
      <button onClick={onDismiss} className="text-red-600 hover:text-red-400 ml-4">×</button>
    </div>
  );
}
