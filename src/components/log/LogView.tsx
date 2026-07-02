import { useEffect, useState, useRef, useMemo } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import ConfirmDeleteModal from "../shared/ConfirmDeleteModal";
import EmptyState from "../shared/EmptyState";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import type { LogEntry, LogOutcome } from "../../types/log";
import { logCommands } from "../../lib/commands/logs";
import RecordingsView from "./RecordingsView";
import { useServerStore } from "../../store/serverStore";
import { useUiStore } from "../../store/uiStore";
import { formatError } from "../../lib/errors";
import { duration, fmtDate } from "../../lib/formatTime";

const PAGE = 50;

const OUTCOME_STYLES: Record<LogOutcome, string> = {
  connecting: "text-warning",
  success:    "text-success",
  user_closed:"text-muted",
  failure:    "text-error",
  timeout:    "text-orange-400",
};

const OUTCOME_LABEL: Record<LogOutcome, string> = {
  connecting: "Connecting",
  success:    "Success",
  user_closed:"Closed",
  failure:    "Failed",
  timeout:    "Timeout",
};

type SortCol = "time" | "outcome" | "duration";
type SortDir = "asc" | "desc";

const OUTCOME_CHIPS: { value: string; label: string }[] = [
  { value: "",            label: "All" },
  { value: "success",     label: "Success" },
  { value: "failure",     label: "Failed" },
  { value: "timeout",     label: "Timeout" },
  { value: "user_closed", label: "Closed" },
];

function durationMs(e: LogEntry): number {
  if (!e.sessionEnd) return -1;
  return new Date(e.sessionEnd).getTime() - new Date(e.sessionStart).getTime();
}


function sortEntries(list: LogEntry[], col: SortCol | null, dir: SortDir): LogEntry[] {
  if (!col) return list;
  const f = dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    switch (col) {
      case "time":     return f * a.sessionStart.localeCompare(b.sessionStart);
      case "outcome":  return f * a.outcome.localeCompare(b.outcome);
      case "duration": return f * (durationMs(a) - durationMs(b));
      default:         return 0;
    }
  });
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <svg
      className={`w-3 h-3 shrink-0 ${active ? "text-accent-fg" : "text-dim"}`}
      fill="none" viewBox="0 0 8 10" stroke="currentColor" strokeWidth={1.5}
      strokeLinecap="round" strokeLinejoin="round"
    >
      {active && dir === "desc"
        ? <polyline points="1,7 4,3 7,7" />
        : <polyline points="1,3 4,7 7,3" />
      }
    </svg>
  );
}

export default function LogView() {
  const servers = useServerStore((s) => s.servers);
  const logSearchQuery = useUiStore((s) => s.logSearchQuery);

  const [activeTab, setActiveTab] = useState<"connections" | "recordings">("connections");

  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const [filterServer, setFilterServer] = useState("");
  const [filterStart, setFilterStart] = useState("");
  const [filterEnd, setFilterEnd] = useState("");
  const [filterOutcome, setFilterOutcome] = useState("");

  const [sortCol, setSortCol] = useState<SortCol | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const sentinelRef = useRef<HTMLDivElement>(null);

  // Synchronous flag set before setLoading(true) so the observer effect
  // sees it immediately (state updates are asynchronous, refs are not).
  const resettingRef = useRef(false);

  // Synchronous loading guard — prevents a fast IntersectionObserver from
  // firing twice before setLoading(true) has caused a re-render.
  const loadingRef = useRef(false);

  // Always-current snapshot of entries for the append load offset.
  const entriesRef = useRef<LogEntry[]>([]);
  entriesRef.current = entries;

  // Always-current snapshot of backend filters for the append load.
  const filtersRef = useRef({ filterServer, filterStart, filterEnd });
  filtersRef.current = { filterServer, filterStart, filterEnd };

  // ── Reset load ─────────────────────────────────────────────────────────────
  // Runs whenever a backend filter changes. Uses an inline IIFE so the
  // closure always has the current filter values without extra deps gymnastics.
  useEffect(() => {
    resettingRef.current = true;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const rows = await logCommands.listLogs(
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
        resettingRef.current = false;
        setLoading(false);
      }
    })();
  }, [filterServer, filterStart, filterEnd]);

  // ── Infinite scroll ────────────────────────────────────────────────────────
  // Disabled when any client-side filter is active (a short filtered list
  // would keep the sentinel in view and cause a continuous append loop).
  useEffect(() => {
    if (!hasMore || loading || filterOutcome || logSearchQuery.trim()) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || resettingRef.current || loadingRef.current) return;

      const { filterServer: fs, filterStart: fst, filterEnd: fe } = filtersRef.current;
      const offset = entriesRef.current.length;

      loadingRef.current = true;
      setLoading(true);
      void (async () => {
        try {
          const rows = await logCommands.listLogs(
            offset, PAGE,
            fs || undefined, fst || undefined, fe || undefined,
          );
          setEntries((prev) => [...prev, ...rows]);
          setHasMore(rows.length === PAGE);
        } catch (e) {
          setError(formatError(e));
        } finally {
          loadingRef.current = false;
          setLoading(false);
        }
      })();
    }, { threshold: 0 });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, filterOutcome, logSearchQuery]);

  // ── Clear ──────────────────────────────────────────────────────────────────
  const handleClear = async () => {
    setClearing(true);
    try {
      await logCommands.clearLogs();
      setEntries([]);
      setHasMore(false);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setClearing(false);
      setShowClearConfirm(false);
    }
  };

  // ── Export ─────────────────────────────────────────────────────────────────
  const handleExport = async () => {
    setExporting(true);
    try {
      const csv = await logCommands.exportLogsCsv(
        filterServer || undefined,
        filterStart || undefined,
        filterEnd || undefined,
      );
      const path = await save({
        defaultPath: "logs.csv",
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (path) await writeTextFile(path, csv);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setExporting(false);
    }
  };

  // ── Sort ───────────────────────────────────────────────────────────────────
  const toggleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  const hasFilters = filterServer || filterStart || filterEnd || filterOutcome;
  const clearFilters = () => {
    setFilterServer(""); setFilterStart(""); setFilterEnd(""); setFilterOutcome("");
  };

  // ── Client-side pipeline: outcome → text search → sort ─────────────────────
  const displayed = useMemo(() => {
    let list = entries;
    if (filterOutcome) list = list.filter((e) => e.outcome === filterOutcome);
    if (logSearchQuery.trim()) {
      const q = logSearchQuery.toLowerCase();
      list = list.filter((e) =>
        e.serverDisplayName.toLowerCase().includes(q) ||
        e.hostname.toLowerCase().includes(q) ||
        e.username.toLowerCase().includes(q),
      );
    }
    return sortEntries(list, sortCol, sortDir);
  }, [entries, filterOutcome, logSearchQuery, sortCol, sortDir]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const thBase = "px-3 py-2.5 font-medium text-left select-none";
  const sortableTh = (col: SortCol, label: string, px = "px-3") => (
    <th
      className={`${thBase} ${px} cursor-pointer hover:text-white transition-colors`}
      onClick={() => toggleSort(col)}
    >
      <span className="flex items-center gap-1">
        {label}
        <SortIcon active={sortCol === col} dir={sortDir} />
      </span>
    </th>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Tab switcher */}
      <div className="px-5 pt-3 border-b border-stroke-subtle shrink-0 flex items-center gap-4">
        <button
          onClick={() => setActiveTab("connections")}
          className={`pb-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "connections"
              ? "border-accent text-accent-fg"
              : "border-transparent text-faint hover:text-white"
          }`}
        >
          Connection Log
        </button>
        <button
          onClick={() => setActiveTab("recordings")}
          className={`pb-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "recordings"
              ? "border-accent text-accent-fg"
              : "border-transparent text-faint hover:text-white"
          }`}
        >
          Recordings
        </button>
      </div>

      {activeTab === "recordings" && <RecordingsView />}

      {activeTab === "connections" && <>
      {/* Filter bar */}
      <div className="px-5 py-3 border-b border-stroke-subtle shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <Select
            value={filterServer || "__all__"}
            onValueChange={(value) => setFilterServer(!value || value === "__all__" ? "" : value)}
          >
            <SelectTrigger className="h-10">
              <SelectValue>
                {(val) => (!val || val === "__all__") ? "All servers" : (servers.find((s) => s.id === val)?.displayName ?? String(val))}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All servers</SelectItem>
              {servers.map((s) => (
                <SelectItem key={s.id} value={s.id} label={s.displayName}>{s.displayName}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filterOutcome || "__all__"}
            onValueChange={(value) => setFilterOutcome(!value || value === "__all__" ? "" : value)}
          >
            <SelectTrigger className="h-10">
              <SelectValue>
                {(val) => OUTCOME_CHIPS.find((c) => (c.value || "__all__") === val)?.label ?? String(val)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {OUTCOME_CHIPS.map(({ value, label }) => (
                <SelectItem key={value || "__all__"} value={value || "__all__"} label={label}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input type="date" value={filterStart} onChange={(e) => setFilterStart(e.target.value)} className="w-auto" />
          <span className="text-faint text-sm">→</span>
          <Input type="date" value={filterEnd} onChange={(e) => setFilterEnd(e.target.value)} className="w-auto" />

          {hasFilters && (
            <Button variant="ghost" size="lg" onClick={clearFilters}>Clear</Button>
          )}

          <div className="ml-auto flex items-center gap-2">
            <Button variant="secondary" size="lg" onClick={() => { void handleExport(); }} disabled={exporting} className="border border-stroke">
              {exporting ? "Exporting…" : "Export CSV"}
            </Button>
            <Button variant="destructive" size="lg" onClick={() => setShowClearConfirm(true)} disabled={clearing}>
              Clear Logs
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <p className="text-sm text-error px-5 py-2 border-b border-stroke-subtle shrink-0">{error}</p>
      )}

      {/* Outcome filter is client-side only — results come from the already-loaded page */}
      {filterOutcome && (
        <div className="px-5 py-1.5 bg-surface-0 border-b border-stroke-subtle text-meta text-faint shrink-0">
          Showing from loaded entries only — scroll down to load more, then re-apply.
        </div>
      )}

      {/* Empty states — outside the table so h-full centering works */}
      {!loading && entries.length === 0 && (
        <EmptyState
          className="flex-1"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          }
          heading="No connections recorded yet"
          subline="Connection history will appear here once you connect to a server."
        />
      )}

      {!loading && entries.length > 0 && displayed.length === 0 && (
        <EmptyState
          className="flex-1"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
          }
          heading="No entries match"
          subline="Try adjusting the filters or date range."
        />
      )}

      {/* Table */}
      {(loading || displayed.length > 0) && (
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-0 border-b border-stroke-subtle">
              <tr className="text-xs text-faint uppercase tracking-wider">
                {sortableTh("time", "Time", "px-5")}
                <th className={thBase}>Server</th>
                <th className={thBase}>Host</th>
                <th className={thBase}>User</th>
                {sortableTh("outcome", "Outcome")}
                {sortableTh("duration", "Duration")}
              </tr>
            </thead>
            <tbody>
              {displayed.map((e) => (
                <tr
                  key={e.id}
                  className="border-b border-stroke-subtle hover:bg-surface-0 transition-colors"
                  title={e.errorMessage ?? undefined}
                >
                  <td className="px-5 py-2.5 text-muted whitespace-nowrap font-mono text-xs">
                    {fmtDate(e.sessionStart)}
                  </td>
                  <td className="px-3 py-2.5 text-white max-w-[160px] truncate" title={e.serverDisplayName}>
                    {e.serverDisplayName}
                  </td>
                  <td className="px-3 py-2.5 text-faint font-mono text-xs whitespace-nowrap">
                    {e.hostname}:{e.port}
                  </td>
                  <td className="px-3 py-2.5 text-muted">{e.username || "—"}</td>
                  <td className={`px-3 py-2.5 font-medium ${OUTCOME_STYLES[e.outcome as LogOutcome] ?? "text-muted"}`}>
                    {OUTCOME_LABEL[e.outcome as LogOutcome] ?? e.outcome}
                  </td>
                  <td className="px-3 py-2.5 text-faint font-mono text-xs">
                    {duration(e.sessionStart, e.sessionEnd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div ref={sentinelRef} className="h-1" />

          {loading && (
            <div className="flex justify-center py-6">
              <span className="text-faint text-sm">Loading…</span>
            </div>
          )}
        </div>
      )}

      {showClearConfirm && (
        <ConfirmDeleteModal
          title="Clear all logs?"
          description="All connection history will be permanently deleted. This cannot be undone."
          confirmLabel="Clear Logs"
          busy={clearing}
          onConfirm={() => { void handleClear(); }}
          onCancel={() => setShowClearConfirm(false)}
        />
      )}
      </>}
    </div>
  );
}
