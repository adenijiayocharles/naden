import { useState, useMemo } from "react";
import { useSnippetStore } from "../../store/snippetStore";
import { formatError } from "../../lib/errors";
import Button from "../shared/Button";
import Input from "../shared/Input";
import type { Snippet } from "../../types/snippet";

// ── Form modal ─────────────────────────────────────────────────────────────────
function SnippetFormModal({
  snippet,
  onClose,
}: {
  snippet?: Snippet;
  onClose: () => void;
}) {
  const createSnippet = useSnippetStore((s) => s.createSnippet);
  const updateSnippet = useSnippetStore((s) => s.updateSnippet);
  const [title, setTitle] = useState(snippet?.title ?? "");
  const [body, setBody] = useState(snippet?.body ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    try {
      if (snippet) {
        await updateSnippet(snippet.id, { title: title.trim(), body });
      } else {
        await createSnippet({ title: title.trim(), body });
      }
      onClose();
    } catch (e) {
      setError(formatError(e));
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-surface-1 border border-stroke-subtle rounded-xl shadow-2xl w-full max-w-lg p-5 flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-white">
          {snippet ? "Edit Snippet" : "New Snippet"}
        </h3>
        <Input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Command or text…"
          rows={6}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void handleSave();
          }}
          className="w-full bg-surface-3 border border-stroke rounded px-3 py-2 text-sm text-white placeholder-faint focus:outline-none focus:border-accent transition-colors resize-none font-mono"
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex items-center justify-end gap-2">
          <Button size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={() => void handleSave()}
            disabled={busy || !title.trim()}
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
  snippet,
  onClose,
}: {
  snippet: Snippet;
  onClose: () => void;
}) {
  const deleteSnippet = useSnippetStore((s) => s.deleteSnippet);
  const [busy, setBusy] = useState(false);

  const handleDelete = async () => {
    setBusy(true);
    await deleteSnippet(snippet.id);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-surface-1 border border-stroke-subtle rounded-xl shadow-2xl w-full max-w-sm p-5 flex flex-col gap-4">
        <div>
          <h3 className="text-sm font-semibold text-white mb-1">Delete snippet?</h3>
          <p className="text-sm text-muted">
            "{snippet.title}" will be permanently deleted.
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

// ── Snippet card ───────────────────────────────────────────────────────────────
function SnippetCard({
  snippet,
  onEdit,
  onDelete,
}: {
  snippet: Snippet;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(snippet.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="group bg-surface-1 border border-stroke-subtle rounded-lg p-3 flex flex-col gap-2 hover:border-stroke transition-colors">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-white leading-snug break-words min-w-0">{snippet.title}</p>
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

      <pre className="text-xs text-muted font-mono whitespace-pre-wrap break-all line-clamp-3 leading-relaxed">
        {snippet.body}
      </pre>

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => void handleCopy()}
          className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium text-dim hover:text-muted hover:bg-surface-3 transition-colors"
        >
          {copied ? (
            <>
              <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 14 14" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="2,7 5,11 12,3" />
              </svg>
              <span className="text-green-400">Copied</span>
            </>
          ) : (
            <>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 14 14" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="5" width="7" height="8" rx="1" />
                <path d="M9 5V3a1 1 0 00-1-1H3a1 1 0 00-1 1v8a1 1 0 001 1h2" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ── Main view ──────────────────────────────────────────────────────────────────
export default function SnippetList() {
  const snippets = useSnippetStore((s) => s.snippets);
  const isLoading = useSnippetStore((s) => s.isLoading);

  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Snippet | null>(null);
  const [deleting, setDeleting] = useState<Snippet | null>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return snippets;
    const q = query.toLowerCase();
    return snippets.filter(
      (sn) =>
        sn.title.toLowerCase().includes(q) || sn.body.toLowerCase().includes(q),
    );
  }, [snippets, query]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-4 h-10 border-b border-stroke-subtle shrink-0 flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search snippets…"
            className="w-full h-7 bg-surface-3 border border-stroke rounded px-3 text-sm text-white placeholder-faint focus:outline-none focus:border-accent transition-colors"
          />
        </div>
        <Button size="sm" variant="primary" onClick={() => setCreating(true)}>
          + New
        </Button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <p className="text-sm text-dim text-center pt-12">Loading…</p>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-16 gap-3">
            {query ? (
              <p className="text-sm text-dim">No snippets match "{query}"</p>
            ) : (
              <>
                <p className="text-sm text-dim">No snippets yet</p>
                <Button size="sm" variant="primary" onClick={() => setCreating(true)}>
                  Create your first snippet
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="grid gap-3 grid-cols-2 xl:grid-cols-3">
            {filtered.map((sn) => (
              <SnippetCard
                key={sn.id}
                snippet={sn}
                onEdit={() => setEditing(sn)}
                onDelete={() => setDeleting(sn)}
              />
            ))}
          </div>
        )}
      </div>

      {creating && <SnippetFormModal onClose={() => setCreating(false)} />}
      {editing && <SnippetFormModal snippet={editing} onClose={() => setEditing(null)} />}
      {deleting && <DeleteConfirmModal snippet={deleting} onClose={() => setDeleting(null)} />}
    </div>
  );
}
