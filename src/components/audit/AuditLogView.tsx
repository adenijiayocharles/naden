import { useEffect, useState, useCallback } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import type { AuditEntry, AuditOutcome } from "../../types/audit";
import { auditCommands } from "../../lib/tauriCommands";
import { useServerStore } from "../../store/serverStore";
import { formatError } from "../../lib/errors";

const PAGE = 50;

const OUTCOME_STYLES: Record<AuditOutcome, string> = {
  connecting: "text-yellow-400",
  success:    "text-[#CDFF00]",
  user_closed:"text-[#888]",
  failure:    "text-red-400",
  timeout:    "text-orange-400",
};

const OUTCOME_LABEL: Record<AuditOutcome, string> = {
  connecting: "Connecting",
  success:    "Success",
  user_closed:"Closed",
  failure:    "Failed",
  timeout:    "Timeout",
};

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

export default function AuditLogView() {
  const servers = useServerStore((s) => s.servers);

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const [filterServer, setFilterServer] = useState("");
  const [filterStart, setFilterStart] = useState("");
  const [filterEnd, setFilterEnd] = useState("");

  const load = useCallback(async (reset: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const offset = reset ? 0 : entries.length;
      const rows = await auditCommands.listAuditLog(
        offset, PAGE,
        filterServer || undefined,
        filterStart || undefined,
        filterEnd || undefined,
      );
      setEntries(reset ? rows : (prev) => [...prev, ...rows]);
      setHasMore(rows.length === PAGE);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setLoading(false);
    }
  }, [entries.length, filterServer, filterStart, filterEnd]);

  // Reload when filters change
  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const rows = await auditCommands.listAuditLog(
          0, PAGE,
          filterServer || undefined,
          filterStart || undefined,
          filterEnd || undefined,
        );
        setEntries(rows);
        setHasMore(rows.length === PAGE);
      } catch (e) {
        setError(formatError(e));
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterServer, filterStart, filterEnd]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const csv = await auditCommands.exportAuditCsv(
        filterServer || undefined,
        filterStart || undefined,
        filterEnd || undefined,
      );
      const path = await save({
        defaultPath: "audit-log.csv",
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (path) {
        await writeTextFile(path, csv);
      }
    } catch (e) {
      setError(formatError(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-[#1e1e1e] shrink-0 flex-wrap">
        <select
          value={filterServer}
          onChange={(e) => setFilterServer(e.target.value)}
          className="bg-[#1a1a1a] border border-[#2a2a2a] rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent"
        >
          <option value="">All servers</option>
          {servers.map((s) => (
            <option key={s.id} value={s.id}>{s.displayName}</option>
          ))}
        </select>

        <input
          type="date"
          value={filterStart}
          onChange={(e) => setFilterStart(e.target.value)}
          className="bg-[#1a1a1a] border border-[#2a2a2a] rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent"
        />
        <span className="text-[#555] text-sm">→</span>
        <input
          type="date"
          value={filterEnd}
          onChange={(e) => setFilterEnd(e.target.value)}
          className="bg-[#1a1a1a] border border-[#2a2a2a] rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent"
        />

        {(filterServer || filterStart || filterEnd) && (
          <button
            onClick={() => { setFilterServer(""); setFilterStart(""); setFilterEnd(""); }}
            className="text-[#666] hover:text-white text-sm transition-colors"
          >
            Clear
          </button>
        )}

        <button
          onClick={() => { void handleExport(); }}
          disabled={exporting}
          className="ml-auto bg-[#1a1a1a] hover:bg-[#222] border border-[#2a2a2a] text-[#ccc] text-sm px-3 py-1.5 rounded transition-colors disabled:opacity-40"
        >
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-400 px-5 py-2 border-b border-[#1e1e1e]">{error}</p>
      )}

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[#0d0d0d] border-b border-[#1e1e1e]">
            <tr className="text-left text-xs text-[#666] uppercase tracking-wider">
              <th className="px-5 py-2.5 font-medium">Time</th>
              <th className="px-3 py-2.5 font-medium">Server</th>
              <th className="px-3 py-2.5 font-medium">Host</th>
              <th className="px-3 py-2.5 font-medium">User</th>
              <th className="px-3 py-2.5 font-medium">Outcome</th>
              <th className="px-3 py-2.5 font-medium">Duration</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr
                key={e.id}
                className="border-b border-[#111] hover:bg-[#0f0f0f] transition-colors"
                title={e.errorMessage ?? undefined}
              >
                <td className="px-5 py-2.5 text-[#888] whitespace-nowrap font-mono text-xs">
                  {fmt(e.sessionStart)}
                </td>
                <td className="px-3 py-2.5 text-white max-w-[160px] truncate">
                  {e.serverDisplayName}
                </td>
                <td className="px-3 py-2.5 text-[#666] font-mono text-xs whitespace-nowrap">
                  {e.hostname}:{e.port}
                </td>
                <td className="px-3 py-2.5 text-[#888]">{e.username || "—"}</td>
                <td className={`px-3 py-2.5 font-medium ${OUTCOME_STYLES[e.outcome as AuditOutcome] ?? "text-[#888]"}`}>
                  {OUTCOME_LABEL[e.outcome as AuditOutcome] ?? e.outcome}
                </td>
                <td className="px-3 py-2.5 text-[#666] font-mono text-xs">
                  {duration(e.sessionStart, e.sessionEnd)}
                </td>
              </tr>
            ))}

            {!loading && entries.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-16 text-center text-[#555]">
                  No connections recorded yet
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {hasMore && !loading && (
          <div className="flex justify-center py-4">
            <button
              onClick={() => { void load(false); }}
              className="text-sm text-[#666] hover:text-white transition-colors"
            >
              Load more
            </button>
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-6">
            <span className="text-[#555] text-sm">Loading…</span>
          </div>
        )}
      </div>
    </div>
  );
}
