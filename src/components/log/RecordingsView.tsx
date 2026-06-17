import { useCallback, useEffect, useState } from "react";
import { Button } from "../ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import EmptyState from "../shared/EmptyState";
import type { SessionLog } from "../../types/sessionLog";
import { sessionLogCommands } from "../../lib/tauriCommands";
import { useServerStore } from "../../store/serverStore";
import { formatError } from "../../lib/errors";

const PAGE_SIZE = 50;

function duration(start: string, end: string | null): string {
  if (!end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function RecordingsView() {
  const servers = useServerStore((s) => s.servers);
  const [logs, setLogs] = useState<SessionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterServer, setFilterServer] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);

  const load = useCallback(async (serverFilter: string, append: boolean, currentOffset: number) => {
    setLoading(true);
    setError(null);
    try {
      const rows = await sessionLogCommands.listSessionLogs(
        serverFilter || undefined,
        PAGE_SIZE + 1,
        currentOffset,
      );
      const more = rows.length > PAGE_SIZE;
      if (more) rows.pop();
      setLogs((prev) => append ? [...prev, ...rows] : rows);
      setHasMore(more);
      setOffset(currentOffset + rows.length);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setOffset(0);
    void load(filterServer, false, 0);
  }, [filterServer, load]);

  const handleDelete = async (log: SessionLog) => {
    setDeletingId(log.id);
    try {
      await sessionLogCommands.deleteSessionLog(log.id);
      setLogs((prev) => prev.filter((l) => l.id !== log.id));
    } catch (e) {
      setError(formatError(e));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3 border-b border-stroke-subtle shrink-0 flex items-center gap-3">
        <Select
          value={filterServer || "__all__"}
          onValueChange={(v) => setFilterServer(!v || v === "__all__" ? "" : v)}
        >
          <SelectTrigger className="h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All servers</SelectItem>
            {servers.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.displayName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <p className="text-sm text-error px-5 py-2 border-b border-stroke-subtle shrink-0">{error}</p>
      )}

      {!loading && logs.length === 0 && (
        <EmptyState
          className="flex-1"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
          }
          heading="No recordings yet"
          subline="Click the record button in the terminal tab bar to start capturing session output."
        />
      )}

      {logs.length > 0 && (
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-0 border-b border-stroke-subtle">
              <tr className="text-xs text-faint uppercase tracking-wider">
                <th className="px-5 py-2.5 font-medium text-left">Time</th>
                <th className="px-3 py-2.5 font-medium text-left">Server</th>
                <th className="px-3 py-2.5 font-medium text-left">Duration</th>
                <th className="px-3 py-2.5 font-medium text-left">Size</th>
                <th className="px-3 py-2.5 font-medium text-left" />
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-stroke-subtle hover:bg-surface-0 transition-colors">
                  <td className="px-5 py-2.5 text-muted whitespace-nowrap font-mono text-xs">
                    {fmt(log.startTime)}
                  </td>
                  <td className="px-3 py-2.5 text-white max-w-[160px] truncate">{log.serverDisplayName}</td>
                  <td className="px-3 py-2.5 text-faint font-mono text-xs">
                    {duration(log.startTime, log.endTime)}
                  </td>
                  <td className="px-3 py-2.5 text-faint font-mono text-xs">
                    {fmtBytes(log.fileSizeBytes)}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1 justify-end">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => void sessionLogCommands.revealSessionLog(log.id)}
                        title="Reveal in Finder"
                        className="text-faint hover:text-white"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2" y="2" width="5" height="5" rx="0.5" />
                          <rect x="9" y="2" width="5" height="5" rx="0.5" />
                          <rect x="2" y="9" width="5" height="5" rx="0.5" />
                          <rect x="9" y="9" width="5" height="5" rx="0.5" />
                        </svg>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => void handleDelete(log)}
                        disabled={deletingId === log.id}
                        title="Delete recording"
                        className="text-faint hover:text-red-400"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3,4 13,4" />
                          <path d="M6 4V2h4v2" />
                          <path d="M4 4l1 9h6l1-9" />
                        </svg>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {hasMore && (
            <div className="py-4 text-center border-t border-stroke-subtle">
              <Button
                variant="secondary"
                onClick={() => void load(filterServer, true, offset)}
                disabled={loading}
                className="h-8 text-xs px-4"
              >
                {loading ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
