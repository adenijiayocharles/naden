import { Button } from "../ui/button";

interface Props {
  hostCount: number;
  pendingInput: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function BroadcastGuardBar({ hostCount, pendingInput, onConfirm, onCancel }: Props) {
  return (
    <div className="px-4 py-2 bg-error-subtle border-b border-error-subtle flex items-center gap-3 text-xs shrink-0">
      <span className="text-error flex-1">
        Send <span className="font-mono text-white">{pendingInput.trim()}</span> to{" "}
        <span className="font-semibold">{hostCount} host{hostCount > 1 ? "s" : ""}</span>? This looks destructive.
      </span>
      <Button variant="delete" onClick={onConfirm} size="sm">
        Send anyway
      </Button>
      <Button variant="ghost" onClick={onCancel} size="sm" className="text-faint">
        Cancel
      </Button>
    </div>
  );
}
