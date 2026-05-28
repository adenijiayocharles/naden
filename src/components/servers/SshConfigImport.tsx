import { useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { homeDir, join } from "@tauri-apps/api/path";
import type { ImportPreview } from "../../types/server";
import { sshCommands } from "../../lib/tauriCommands";
import { useServerStore } from "../../store/serverStore";
import { formatError } from "../../lib/errors";

interface Props {
  onClose: () => void;
}

export default function SshConfigImport({ onClose }: Props) {
  const fetchAll = useServerStore((s) => s.fetchAll);
  const [configPath, setConfigPath] = useState("");
  const [previews, setPreviews] = useState<ImportPreview[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<number | null>(null);

  useEffect(() => {
    homeDir()
      .then((home) => join(home, ".ssh", "config"))
      .then(setConfigPath)
      .catch(() => {});
  }, []);

  const browseConfig = async () => {
    try {
      const home = await homeDir();
      const sshDir = await join(home, ".ssh");
      const result = await open({ multiple: false, title: "Select SSH Config File", defaultPath: sshDir });
      if (typeof result === "string") setConfigPath(result);
    } catch { /* cancelled */ }
  };

  const loadPreviews = async () => {
    setLoading(true);
    setError(null);
    setPreviews(null);
    setSelected(new Set());
    setImported(null);
    try {
      const results = await sshCommands.importSshConfig(configPath || undefined);
      setPreviews(results);
      setSelected(new Set(results.map((p) => p.pattern)));
    } catch (e) {
      setError(formatError(e));
    } finally {
      setLoading(false);
    }
  };

  const toggleAll = () => {
    if (!previews) return;
    if (selected.size === previews.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(previews.map((p) => p.pattern)));
    }
  };

  const toggle = (pattern: string) => {
    setSelected((s) => {
      const next = new Set(s);
      next.has(pattern) ? next.delete(pattern) : next.add(pattern);
      return next;
    });
  };

  const handleImport = async () => {
    if (!previews) return;
    const toImport = previews.filter((p) => selected.has(p.pattern));
    if (toImport.length === 0) return;

    setImporting(true);
    setError(null);
    try {
      await sshCommands.confirmSshConfigImport(toImport);
      await fetchAll();
      setImported(toImport.length);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface-1 border border-stroke-subtle rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stroke-subtle shrink-0">
          <h2 className="text-lg font-semibold text-white">Import from SSH Config</h2>
          <button onClick={onClose} className="text-muted hover:text-white p-1 rounded" aria-label="Close">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {/* Path picker */}
          <div>
            <label className="block text-sm font-medium text-secondary mb-1">Config file path</label>
            <div className="flex gap-2">
              <input
                value={configPath}
                onChange={(e) => setConfigPath(e.target.value)}
                className="flex-1 h-10 bg-surface-3 border border-stroke rounded px-3 text-sm text-white focus:outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={() => { void browseConfig(); }}
                className="px-3 py-2 bg-surface-3 hover:bg-surface-4 text-secondary text-sm rounded border border-stroke transition-colors shrink-0"
              >
                Browse
              </button>
              <button
                type="button"
                onClick={() => { void loadPreviews(); }}
                disabled={loading}
                className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-40 text-black font-semibold text-sm rounded transition-colors shrink-0"
              >
                {loading ? "Reading…" : "Read"}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-950 border border-red-800 rounded-md px-3 py-2">{error}</p>
          )}

          {imported !== null && (
            <p className="text-sm text-green-400 bg-green-950 border border-green-800 rounded-md px-3 py-2">
              ✓ Imported {imported} server{imported !== 1 ? "s" : ""} successfully.
            </p>
          )}

          {/* Preview table */}
          {previews && previews.length === 0 && (
            <p className="text-sm text-muted text-center py-8">
              No Host entries found in this config file.
            </p>
          )}

          {previews && previews.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-muted">
                  {selected.size} of {previews.length} selected
                </p>
                <button
                  onClick={toggleAll}
                  className="text-xs text-accent hover:text-accent-hover"
                >
                  {selected.size === previews.length ? "Deselect all" : "Select all"}
                </button>
              </div>

              <div className="border border-stroke-subtle rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-surface-2">
                    <tr className="border-b border-stroke-subtle">
                      <th className="w-10 px-3 py-2" />
                      <th className="text-left px-3 py-2 text-muted font-medium">Host</th>
                      <th className="text-left px-3 py-2 text-muted font-medium">Hostname</th>
                      <th className="text-left px-3 py-2 text-muted font-medium">User</th>
                      <th className="text-left px-3 py-2 text-muted font-medium">Port</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previews.map((p) => (
                      <tr
                        key={p.pattern}
                        onClick={() => toggle(p.pattern)}
                        className={`cursor-pointer border-b border-stroke-subtle last:border-0 transition-colors ${
                          selected.has(p.pattern) ? "bg-accent/5" : "hover:bg-surface-2"
                        }`}
                      >
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={selected.has(p.pattern)}
                            onChange={() => toggle(p.pattern)}
                            onClick={(e) => e.stopPropagation()}
                            className="rounded border-stroke"
                          />
                        </td>
                        <td className="px-3 py-2 font-mono text-white">{p.pattern}</td>
                        <td className="px-3 py-2 text-muted">{p.hostname ?? <span className="text-faint italic">same as host</span>}</td>
                        <td className="px-3 py-2 text-muted">{p.username ?? "—"}</td>
                        <td className="px-3 py-2 text-muted">{p.port ?? 22}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-stroke-subtle shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted hover:text-white bg-surface-3 hover:bg-surface-4 rounded transition-colors"
          >
            {imported !== null ? "Done" : "Cancel"}
          </button>
          {previews && previews.length > 0 && imported === null && (
            <button
              onClick={() => { void handleImport(); }}
              disabled={importing || selected.size === 0}
              className="px-4 py-2 text-sm text-black bg-accent hover:bg-accent-hover disabled:opacity-40 rounded transition-colors font-semibold"
            >
              {importing ? "Importing…" : `Import ${selected.size} server${selected.size !== 1 ? "s" : ""}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
