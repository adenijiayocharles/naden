import { useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { homeDir, join } from "@tauri-apps/api/path";
import type { ImportPreview } from "../../types/server";
import { sshCommands } from "../../lib/tauriCommands";
import { useServerStore } from "../../store/serverStore";
import { formatError } from "../../lib/errors";

type Tab = "import" | "export";

interface Props {
  onClose: () => void;
}

export default function SshConfigImport({ onClose }: Props) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const fetchAll = useServerStore((s) => s.fetchAll);
  const servers = useServerStore((s) => s.servers);

  const [activeTab, setActiveTab] = useState<Tab>("import");

  // Import state
  const [configPath, setConfigPath] = useState("");
  const [previews, setPreviews] = useState<ImportPreview[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [imported, setImported] = useState<number | null>(null);

  // Export state
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportCount, setExportCount] = useState<number | null>(null);

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
    setImportError(null);
    setPreviews(null);
    setSelected(new Set());
    setImported(null);
    try {
      const results = await sshCommands.importSshConfig(configPath || undefined);
      setPreviews(results);
      setSelected(new Set(results.map((p) => p.pattern)));
    } catch (e) {
      setImportError(formatError(e));
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
      if (next.has(pattern)) next.delete(pattern);
      else next.add(pattern);
      return next;
    });
  };

  const handleImport = async () => {
    if (!previews) return;
    const toImport = previews.filter((p) => selected.has(p.pattern));
    if (toImport.length === 0) return;

    setImporting(true);
    setImportError(null);
    try {
      await sshCommands.confirmSshConfigImport(toImport);
      await fetchAll();
      setImported(toImport.length);
    } catch (e) {
      setImportError(formatError(e));
    } finally {
      setImporting(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    setExportError(null);
    setExportCount(null);
    try {
      const count = await sshCommands.exportSshConfig();
      setExportCount(count);
    } catch (e) {
      setExportError(formatError(e));
    } finally {
      setExporting(false);
    }
  };

  const TABS: { id: Tab; label: string }[] = [
    { id: "import", label: "Import" },
    { id: "export", label: "Export" },
  ];

  return (
    <div
      className="fixed inset-0 bg-black/85 animate-backdrop-in flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface-1 border border-stroke-subtle rounded-xl shadow-overlay animate-overlay-in w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stroke-subtle shrink-0">
          <h2 className="text-lg font-semibold text-white">SSH Config</h2>
          <Button variant="ghost" size="icon-sm" onClick={onClose} className="text-muted hover:text-white" aria-label="Close">✕</Button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-stroke-subtle shrink-0 px-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-2.5 px-1 mr-5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-accent text-white"
                  : "border-transparent text-muted hover:text-secondary"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {activeTab === "import" && (
            <>
              {/* Path picker */}
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">Config file path</label>
                <div className="flex gap-2">
                  <Input
                    value={configPath}
                    onChange={(e) => setConfigPath(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="lg"
                    onClick={() => { void browseConfig(); }}
                  >
                    Browse
                  </Button>
                  <Button
                    type="button"
                    size="lg"
                    onClick={() => { void loadPreviews(); }}
                    disabled={loading}
                  >
                    {loading ? "Reading…" : "Read"}
                  </Button>
                </div>
              </div>

              {importError && (
                <p className="text-sm text-error bg-error-subtle border border-error-subtle rounded-md px-3 py-2">{importError}</p>
              )}

              {imported !== null && (
                <p className="text-sm text-success bg-success-subtle border border-success-subtle rounded-md px-3 py-2">
                  ✓ Imported {imported} server{imported !== 1 ? "s" : ""} successfully.
                </p>
              )}

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
                            <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={selected.has(p.pattern)}
                                onCheckedChange={() => toggle(p.pattern)}
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
            </>
          )}

          {activeTab === "export" && (
            <div className="space-y-4">
              <div className="rounded-lg bg-surface-2 border border-stroke-subtle px-4 py-3 space-y-1">
                <p className="text-sm text-secondary">
                  Writes all {servers.length} server{servers.length !== 1 ? "s" : ""} to{" "}
                  <code className="font-mono text-white">~/.ssh/config</code> inside a managed block.
                </p>
                <p className="text-sm text-muted">
                  Any entries you've added outside the managed block are preserved. The block is
                  recreated on each export, so manual edits inside it will be overwritten.
                </p>
              </div>

              {exportError && (
                <p className="text-sm text-error bg-error-subtle border border-error-subtle rounded-md px-3 py-2">{exportError}</p>
              )}

              {exportCount !== null && (
                <p className="text-sm text-success bg-success-subtle border border-success-subtle rounded-md px-3 py-2">
                  ✓ Exported {exportCount} server{exportCount !== 1 ? "s" : ""} to ~/.ssh/config.
                </p>
              )}

              <Button
                size="lg"
                onClick={() => { void handleExport(); }}
                disabled={exporting || servers.length === 0}
              >
                {exporting ? "Exporting…" : `Export ${servers.length} server${servers.length !== 1 ? "s" : ""} to ~/.ssh/config`}
              </Button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-stroke-subtle shrink-0">
          <Button variant="secondary" size="lg" onClick={onClose}>
            {activeTab === "import" && imported !== null ? "Done" : "Close"}
          </Button>
          {activeTab === "import" && previews && previews.length > 0 && imported === null && (
            <Button
              size="lg"
              onClick={() => { void handleImport(); }}
              disabled={importing || selected.size === 0}
            >
              {importing ? "Importing…" : `Import ${selected.size} server${selected.size !== 1 ? "s" : ""}`}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
