import { usePlaybookRunStore } from "../../store/playbookRunStore";

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
        <button onClick={confirm} className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white rounded transition-colors font-semibold">
          Send anyway
        </button>
        <button onClick={skip} className="text-faint hover:text-white transition-colors">
          Skip
        </button>
        <button onClick={cancel} className="text-faint hover:text-white transition-colors">
          Cancel
        </button>
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
        <button onClick={cancel} className="text-faint hover:text-white transition-colors">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 py-2 bg-surface-2 border-b border-stroke-subtle flex items-center gap-3 text-xs shrink-0">
      <span className="text-dim flex-1">
        <span className="text-white font-medium">{playbook.title}</span>{" "}
        {status.kind === "done" ? "finished" : "cancelled"}
      </span>
      <button onClick={dismiss} className="text-faint hover:text-white transition-colors">
        Dismiss
      </button>
    </div>
  );
}
