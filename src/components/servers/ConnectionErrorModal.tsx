import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";

interface Props {
  serverName: string;
  message?: string;
  onRetry: () => void;
  onEdit: () => void;
  onClose: () => void;
}

export default function ConnectionErrorModal({ serverName, message, onRetry, onEdit, onClose }: Props) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-error-subtle border border-error-subtle flex items-center justify-center shrink-0 mt-0.5">
            <svg className="w-4 h-4 text-error" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 3v5M8 10.5v1" />
              <circle cx="8" cy="8" r="7" />
            </svg>
          </div>
          <div className="min-w-0">
            <DialogTitle className="text-title text-white mb-0.5">Connection failed</DialogTitle>
            <p className="text-meta text-muted">{serverName}</p>
          </div>
        </div>

        {message && (
          <p className="text-sm text-secondary bg-surface-0 border border-stroke-subtle rounded-lg px-3 py-2.5 font-mono break-words mb-5">
            {message}
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button variant="secondary" onClick={onClose} className="flex-1 h-10">
            Dismiss
          </Button>
          <Button variant="secondary" onClick={onEdit} className="flex-1 h-10">
            Edit
          </Button>
          <Button onClick={onRetry} className="flex-1 h-10">
            Retry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
