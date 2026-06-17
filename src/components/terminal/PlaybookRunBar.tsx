import { usePlaybookRunStore } from "../../store/playbookRunStore";
import { Button } from "../ui/button";

export default function PlaybookRunBar() {
  const playbook = usePlaybookRunStore((s) => s.playbook);
  const status = usePlaybookRunStore((s) => s.status);
  const cancel = usePlaybookRunStore((s) => s.cancel);
  const confirm = usePlaybookRunStore((s) => s.confirm);
  const skip = usePlaybookRunStore((s) => s.skip);
  const dismiss = usePlaybookRunStore((s) => s.dismiss);

  if (!playbook || !status) return null;

  if (status.kind === "awaiting-confirmation") {
    return (
      <div className="px-4 py-2 bg-error-subtle border-b border-error-subtle flex items-center gap-3 text-xs shrink-0">
        <span className="text-error flex-1">
          Step {status.stepIndex + 1}/{playbook.steps.length} — send{" "}
          <span className="font-mono text-white">{status.resolvedCommand}</span>? This looks destructive.
        </span>
        <Button variant="delete" onClick={confirm} size="sm">
          Send anyway
        </Button>
        <Button variant="ghost" onClick={skip} size="sm" className="text-faint">
          Skip
        </Button>
        <Button variant="ghost" onClick={cancel} size="sm" className="text-faint">
          Cancel
        </Button>
      </div>
    );
  }

  if (status.kind === "running") {
    const step = playbook.steps[status.stepIndex];
    return (
      <div className="px-4 py-2 bg-surface-2 border-b border-stroke-subtle flex items-center gap-3 text-xs shrink-0">
        <span className="text-dim flex-1">
          Running <span className="text-white font-medium">{playbook.title}</span> — step{" "}
          {status.stepIndex + 1}/{playbook.steps.length}{" "}
          <span className="font-mono text-white">{step.command}</span>
        </span>
        <Button variant="ghost" onClick={cancel} size="sm" className="text-faint">
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="px-4 py-2 bg-surface-2 border-b border-stroke-subtle flex items-center gap-3 text-xs shrink-0">
      <span className="text-dim flex-1">
        <span className="text-white font-medium">{playbook.title}</span>{" "}
        {status.kind === "done" ? "finished" : "cancelled"}
      </span>
      <Button variant="ghost" onClick={dismiss} size="sm" className="text-faint">
        Dismiss
      </Button>
    </div>
  );
}
