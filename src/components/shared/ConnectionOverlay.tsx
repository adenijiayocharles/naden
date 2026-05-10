interface ConnectingProps {
  serverName: string;
  onCancel: () => void;
}

interface ErrorProps {
  errorMessage?: string;
  onClose: () => void;
  onReconnect?: () => void;
}

export function ConnectingOverlay({ serverName, onCancel }: ConnectingProps) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-0 gap-4">
      <p className="text-faint text-sm tracking-wide">
        Connecting to{" "}
        <span className="text-white font-medium">{serverName}</span>…
      </p>
      <div className="relative w-48 h-0.5 bg-surface-4 rounded-full overflow-hidden">
        <div
          className="absolute top-0 h-full bg-accent rounded-full"
          style={{ animation: "progress-slide 1.2s ease-in-out infinite" }}
        />
      </div>
      <button
        onClick={onCancel}
        className="bg-accent hover:bg-accent-hover text-black text-sm font-semibold px-4 py-1.5 rounded transition-colors mt-2"
      >
        Cancel
      </button>
    </div>
  );
}

export function ErrorOverlay({ errorMessage, onClose, onReconnect }: ErrorProps) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-0/95 gap-4">
      <p className="text-red-400 text-sm font-medium">Connection failed</p>
      {errorMessage && (
        <p className="text-faint text-xs max-w-xs text-center">{errorMessage}</p>
      )}
      <div className="flex gap-3 mt-1">
        {onReconnect && (
          <button
            onClick={onReconnect}
            className="px-4 py-2 text-sm text-black bg-accent hover:bg-accent-hover rounded font-semibold transition-colors"
          >
            Reconnect
          </button>
        )}
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm text-muted hover:text-white bg-surface-3 hover:bg-surface-4 rounded transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}
