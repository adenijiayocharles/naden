interface Props {
  serverName: string;
  message?: string;
  onRetry: () => void;
  onClose: () => void;
}

export default function ConnectionErrorModal({ serverName, message, onRetry, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 bg-black/85 animate-backdrop-in flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface-1 border border-stroke rounded-xl shadow-overlay animate-overlay-in w-full max-w-sm p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-red-950/60 border border-red-800/50 flex items-center justify-center shrink-0 mt-0.5">
            <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 3v5M8 10.5v1" />
              <circle cx="8" cy="8" r="7" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-title text-white mb-0.5">Connection failed</p>
            <p className="text-meta text-muted">{serverName}</p>
          </div>
        </div>

        {message && (
          <p className="text-sm text-secondary bg-surface-0 border border-stroke-subtle rounded-lg px-3 py-2.5 font-mono break-words mb-5">
            {message}
          </p>
        )}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-sm text-muted hover:text-white bg-surface-3 hover:bg-surface-4 rounded transition-colors"
          >
            Dismiss
          </button>
          <button
            onClick={onRetry}
            className="flex-1 py-2 text-sm text-black bg-accent hover:bg-accent-hover rounded font-semibold transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    </div>
  );
}
