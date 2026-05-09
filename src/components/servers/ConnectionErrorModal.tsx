interface Props {
  serverName: string;
  message: string;
  onRetry: () => void;
  onClose: () => void;
}

export default function ConnectionErrorModal({ serverName, message, onRetry, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#111] border border-[#2a2a2a] rounded-xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-red-950/60 border border-red-800/50 flex items-center justify-center shrink-0 mt-0.5">
            <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 3v5M8 10.5v1" />
              <circle cx="8" cy="8" r="7" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white mb-0.5">Connection failed</p>
            <p className="text-xs text-[#777]">{serverName}</p>
          </div>
        </div>

        <p className="text-sm text-[#bbb] bg-[#0d0d0d] border border-[#1e1e1e] rounded-lg px-3 py-2.5 font-mono break-words mb-5">
          {message}
        </p>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-sm text-[#777] hover:text-white bg-[#1a1a1a] hover:bg-[#222] rounded transition-colors"
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
