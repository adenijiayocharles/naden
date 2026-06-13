import { useEffect, useState } from "react";

interface ReconnectingProps {
  reconnectAt: number;
  onCancel: () => void;
}

export function ReconnectingOverlay({ reconnectAt, onCancel }: ReconnectingProps) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.ceil((reconnectAt - Date.now()) / 1000)),
  );

  useEffect(() => {
    const tick = setInterval(() => {
      setRemaining(Math.max(0, Math.ceil((reconnectAt - Date.now()) / 1000)));
    }, 250);
    return () => clearInterval(tick);
  }, [reconnectAt]);

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-0/95 gap-4">
      <p className="text-faint text-sm font-medium">Connection lost</p>
      <p className="text-dim text-xs">
        Reconnecting in{" "}
        <span className="text-white tabular-nums">{remaining}s</span>…
      </p>
      <button
        onClick={onCancel}
        className="px-4 py-2 text-sm text-muted hover:text-white bg-surface-3 hover:bg-surface-4 rounded transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}

interface ConnectingProps {
  serverName: string;
  onCancel: () => void;
}

interface ErrorProps {
  errorMessage?: string;
  onClose: () => void;
  onReconnect?: () => void;
  onRemoveKnownHost?: () => void;
}

export function ConnectingOverlay({ serverName, onCancel }: ConnectingProps) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-0 gap-4">
      <p className="text-faint text-sm tracking-wide">
        Connecting to{" "}
        <span className="text-white font-medium">{serverName}</span>…
      </p>
      <div
        role="progressbar"
        aria-label="Connecting…"
        aria-valuetext="Establishing SSH connection"
        className="relative w-52 h-1 bg-surface-4 rounded-full overflow-hidden"
      >
        <div
          className="absolute top-0 h-full bg-accent rounded-full"
          style={{ animation: "progress-slide 1.2s ease-in-out infinite" }}
        />
      </div>
      <p className="text-dim text-xs">Establishing SSH connection…</p>
      <button
        onClick={onCancel}
        className="px-4 py-2 text-sm text-muted hover:text-white bg-surface-3 hover:bg-surface-4 rounded transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}

export function ErrorOverlay({ errorMessage, onClose, onReconnect, onRemoveKnownHost }: ErrorProps) {
  const isHostKeyMismatch = !!errorMessage?.toLowerCase().includes("host key mismatch");

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-0/95 gap-4">
      <p className="text-error text-sm font-medium">Connection failed</p>
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
        {isHostKeyMismatch && onRemoveKnownHost && (
          <button
            onClick={onRemoveKnownHost}
            className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-500 rounded font-semibold transition-colors"
          >
            Remove from known hosts
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
