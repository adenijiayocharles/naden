import { useState, useMemo } from "react";
import { usePlaybookStore } from "../../store/playbookStore";
import { formatError } from "../../lib/errors";
import Button from "../shared/Button";
import Input from "../shared/Input";
import EmptyState from "../shared/EmptyState";
import type { Playbook, StepInput } from "../../types/playbook";

const VARIABLE_HINTS = ["{{host}}", "{{username}}", "{{port}}", "{{displayName}}"];

let stepKeySeq = 0;
function nextStepKey() {
  stepKeySeq += 1;
  return `step-${stepKeySeq}`;
}

interface DraftStep extends StepInput {
  key: string;
}

function toDraftSteps(steps: Playbook["steps"]): DraftStep[] {
  if (steps.length === 0) return [{ key: nextStepKey(), command: "", delayMs: 400 }];
  return steps.map((s) => ({ key: nextStepKey(), command: s.command, delayMs: s.delayMs }));
}

// ── Step editor row ────────────────────────────────────────────────────────────
function StepRow({
  step,
  index,
  total,
  onChange,
  onRemove,
  onMove,
}: {
  step: DraftStep;
  index: number;
  total: number;
  onChange: (next: Partial<StepInput>) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  return (
    <div className="flex items-start gap-2 bg-surface-2 border border-stroke-subtle rounded-lg p-2">
      <span className="text-xs text-faint font-mono pt-2.5 w-5 text-right shrink-0">{index + 1}</span>
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <Input
          value={step.command}
          onChange={(e) => onChange({ command: e.target.value })}
          placeholder="Command, e.g. ssh-copy-id {{username}}@{{host}}"
          className="font-mono text-xs"
        />
        <div className="flex items-center gap-1.5 flex-wrap">
          {VARIABLE_HINTS.map((hint) => (
            <button
              key={hint}
              type="button"
              onClick={() => onChange({ command: `${step.command}${hint}` })}
              className="px-1.5 py-0.5 rounded text-[11px] font-mono text-dim bg-surface-3 hover:text-white hover:bg-surface-4 transition-colors"
            >
              {hint}
            </button>
          ))}
          <span className="text-faint text-[11px] ml-auto shrink-0">delay</span>
          <input
            type="number"
            min={0}
            step={100}
            value={step.delayMs}
            onChange={(e) => onChange({ delayMs: Math.max(0, Number(e.target.value) || 0) })}
            className="w-16 h-6 bg-surface-3 border border-white/5 rounded px-1.5 text-[11px] text-white focus:outline-none focus:border-accent/30 transition-colors"
          />
          <span className="text-faint text-[11px]">ms</span>
        </div>
      </div>
      <div className="flex flex-col gap-0.5 shrink-0">
        <button
          type="button"
          onClick={() => onMove(-1)}
          disabled={index === 0}
          className="p-1 rounded text-dim hover:text-white hover:bg-surface-3 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
          title="Move up"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9V3M3 6l3-3 3 3" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={index === total - 1}
          className="p-1 rounded text-dim hover:text-white hover:bg-surface-3 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
          title="Move down"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 3v6M3 6l3 3 3-3" />
          </svg>
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={total === 1}
          className="p-1 rounded text-dim hover:text-red-400 hover:bg-surface-3 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
          title="Remove step"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Form modal ─────────────────────────────────────────────────────────────────
function PlaybookFormModal({
  playbook,
  onClose,
}: {
  playbook?: Playbook;
  onClose: () => void;
}) {
  const createPlaybook = usePlaybookStore((s) => s.createPlaybook);
  const updatePlaybook = usePlaybookStore((s) => s.updatePlaybook);
  const [title, setTitle] = useState(playbook?.title ?? "");
  const [description, setDescription] = useState(playbook?.description ?? "");
  const [steps, setSteps] = useState<DraftStep[]>(() => toDraftSteps(playbook?.steps ?? []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateStep = (key: string, next: Partial<StepInput>) =>
    setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, ...next } : s)));

  const removeStep = (key: string) =>
    setSteps((prev) => (prev.length > 1 ? prev.filter((s) => s.key !== key) : prev));

  const moveStep = (index: number, direction: -1 | 1) =>
    setSteps((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const addStep = () => setSteps((prev) => [...prev, { key: nextStepKey(), command: "", delayMs: 400 }]);

  const isValid = title.trim().length > 0 && steps.some((s) => s.command.trim().length > 0);

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        steps: steps
          .filter((s) => s.command.trim().length > 0)
          .map(({ command, delayMs }) => ({ command, delayMs })),
      };
      if (playbook) {
        await updatePlaybook(playbook.id, payload);
      } else {
        await createPlaybook(payload);
      }
      onClose();
    } catch (e) {
      setError(formatError(e));
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/85 animate-backdrop-in flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-surface-1 border border-stroke-subtle rounded-xl shadow-overlay animate-overlay-in w-full max-w-xl p-5 flex flex-col gap-3 max-h-[85vh]">
        <h3 className="text-title text-white">
          {playbook ? "Edit Playbook" : "New Playbook"}
        </h3>
        <Input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title, e.g. Restart nginx"
        />
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
        />

        <div className="flex-1 overflow-y-auto flex flex-col gap-2 min-h-0">
          {steps.map((step, i) => (
            <StepRow
              key={step.key}
              step={step}
              index={i}
              total={steps.length}
              onChange={(next) => updateStep(step.key, next)}
              onRemove={() => removeStep(step.key)}
              onMove={(direction) => moveStep(i, direction)}
            />
          ))}
          <Button size="sm" onClick={addStep} className="self-start">
            + Add step
          </Button>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex items-center justify-end gap-2">
          <Button size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={() => void handleSave()}
            disabled={busy || !isValid}
          >
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Delete confirm ─────────────────────────────────────────────────────────────
function DeleteConfirmModal({
  playbook,
  onClose,
}: {
  playbook: Playbook;
  onClose: () => void;
}) {
  const deletePlaybook = usePlaybookStore((s) => s.deletePlaybook);
  const [busy, setBusy] = useState(false);

  const handleDelete = async () => {
    setBusy(true);
    await deletePlaybook(playbook.id);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/85 animate-backdrop-in flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-surface-1 border border-stroke-subtle rounded-xl shadow-overlay animate-overlay-in w-full max-w-sm p-5 flex flex-col gap-4">
        <div>
          <h3 className="text-title text-white mb-1">Delete playbook?</h3>
          <p className="text-sm text-muted">
            "{playbook.title}" and its {playbook.steps.length} step{playbook.steps.length === 1 ? "" : "s"} will be permanently deleted.
          </p>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="delete"
            onClick={() => void handleDelete()}
            disabled={busy}
          >
            {busy ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Playbook card ──────────────────────────────────────────────────────────────
function PlaybookCard({
  playbook,
  onEdit,
  onDelete,
}: {
  playbook: Playbook;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group bg-surface-1 border border-stroke-subtle rounded-lg p-2.5 flex flex-col gap-1.5 hover:border-stroke hover:bg-surface-2 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white leading-snug break-words">{playbook.title}</p>
          {playbook.description && (
            <p className="text-meta text-dim leading-snug break-words mt-0.5">{playbook.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onEdit}
            className="p-1 rounded text-dim hover:text-muted hover:bg-surface-3 transition-colors"
            title="Edit"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M11.5 2.5a1.414 1.414 0 012 2L5 13H2v-3L11.5 2.5z" />
            </svg>
          </button>
          <button
            onClick={onDelete}
            className="p-1 rounded text-dim hover:text-red-400 hover:bg-surface-3 transition-colors"
            title="Delete"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 4h10M6 4V2h4v2M5 4v9a1 1 0 001 1h4a1 1 0 001-1V4" />
            </svg>
          </button>
        </div>
      </div>

      <ol className="text-xs text-muted font-mono flex flex-col gap-0.5">
        {playbook.steps.slice(0, 3).map((step, i) => (
          <li key={step.id} className="truncate">
            <span className="text-faint">{i + 1}.</span> {step.command}
          </li>
        ))}
        {playbook.steps.length > 3 && (
          <li className="text-faint">+{playbook.steps.length - 3} more</li>
        )}
      </ol>
    </div>
  );
}

// ── Main view ──────────────────────────────────────────────────────────────────
export default function PlaybookList() {
  const playbooks = usePlaybookStore((s) => s.playbooks);
  const isLoading = usePlaybookStore((s) => s.isLoading);

  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Playbook | null>(null);
  const [deleting, setDeleting] = useState<Playbook | null>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return playbooks;
    const q = query.toLowerCase();
    return playbooks.filter(
      (pb) =>
        pb.title.toLowerCase().includes(q) ||
        pb.description?.toLowerCase().includes(q) ||
        pb.steps.some((s) => s.command.toLowerCase().includes(q)),
    );
  }, [playbooks, query]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-4 h-14 border-b border-stroke-subtle shrink-0 flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search playbooks…"
            className="w-full h-10 bg-surface-3 border border-stroke rounded px-3 text-sm text-white placeholder-faint focus:outline-none focus:border-accent transition-colors"
          />
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>
          + New
        </Button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <p className="text-sm text-dim text-center pt-12">Loading…</p>
        ) : filtered.length === 0 ? (
          query ? (
            <EmptyState
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35M8.5 8.5l5 5M13.5 8.5l-5 5" />
                </svg>
              }
              heading="No matches"
              subline={`No playbooks match "${query}"`}
            />
          ) : (
            <EmptyState
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 12h6M9 16h6M9 8h2" />
                  <rect x="4" y="3" width="16" height="18" rx="2" />
                </svg>
              }
              heading="No playbooks yet"
              subline="Save ordered command sequences with {{host}}/{{username}} placeholders, and run them in one pane or fan them out across a broadcast group."
              action={{ label: "+ New Playbook", onClick: () => setCreating(true) }}
            />
          )
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
            {filtered.map((pb) => (
              <PlaybookCard
                key={pb.id}
                playbook={pb}
                onEdit={() => setEditing(pb)}
                onDelete={() => setDeleting(pb)}
              />
            ))}
          </div>
        )}
      </div>

      {creating && <PlaybookFormModal onClose={() => setCreating(false)} />}
      {editing && <PlaybookFormModal playbook={editing} onClose={() => setEditing(null)} />}
      {deleting && <DeleteConfirmModal playbook={deleting} onClose={() => setDeleting(null)} />}
    </div>
  );
}
