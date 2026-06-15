import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { homeDir, join } from "@tauri-apps/api/path";
import type { AuthMethod } from "../../types/server";
import type { DiscoveredHost, ScanProgress } from "../../types/discovery";
import { discoveryCommands, serverCommands, vaultCommands } from "../../lib/tauriCommands";
import { useServerStore } from "../../store/serverStore";
import { useVaultStore } from "../../store/vaultStore";
import { formatError } from "../../lib/errors";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";

interface Props {
  onClose: () => void;
}

interface HostDetails {
  port: number;
  username: string;
  authMethod: AuthMethod;
  identityFilePath: string;
  password: string;
  passphrase: string;
}

const SOURCE_LABELS: Record<DiscoveredHost["source"], string> = {
  lan: "LAN",
  knownHosts: "Known Hosts",
};

function hostKey(host: DiscoveredHost): string {
  return `${host.ip}:${host.port}`;
}

function detailsFromHost(host: DiscoveredHost): HostDetails {
  return {
    port: host.port,
    username: host.username ?? "",
    authMethod: host.identityFilePath ? "key" : "password",
    identityFilePath: host.identityFilePath ?? "",
    password: "",
    passphrase: "",
  };
}

export default function DiscoverHosts({ onClose }: Props) {
  const fetchAll = useServerStore((s) => s.fetchAll);
  const isVaultUnlocked = useVaultStore((s) => s.isUnlocked);
  const isPasswordRequired = useVaultStore((s) => s.isPasswordRequired);
  const vaultAvailable = !isPasswordRequired || isVaultUnlocked;

  const [hosts, setHosts] = useState<DiscoveredHost[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<"select" | "details">("select");
  const [details, setDetails] = useState<Record<string, HostDetails>>({});
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    discoveryCommands
      .importKnownHosts()
      .then((results) => {
        setHosts(results);
        setSelected(new Set(results.map(hostKey)));
      })
      .catch((e) => setError(formatError(e)))
      .finally(() => setLoading(false));
  }, []);

  const scanLan = async () => {
    setScanning(true);
    setError(null);
    setProgress({ scanned: 0, total: 0 });

    const unlisten = await listen<ScanProgress>("discovery:scan_progress", (event) => {
      setProgress(event.payload);
    });

    try {
      const results = await discoveryCommands.scanLan();
      setHosts((prev) => {
        const existing = new Set(prev.map(hostKey));
        const additions = results.filter((h) => !existing.has(hostKey(h)));
        return [...prev, ...additions];
      });
      setSelected((prev) => {
        const next = new Set(prev);
        results.forEach((h) => next.add(hostKey(h)));
        return next;
      });
    } catch (e) {
      setError(formatError(e));
    } finally {
      unlisten();
      setScanning(false);
      setProgress(null);
    }
  };

  const toggleAll = () => {
    if (selected.size === hosts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(hosts.map(hostKey)));
    }
  };

  const toggle = (key: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const updateDetail = (key: string, patch: Partial<HostDetails>) => {
    setDetails((d) => ({ ...d, [key]: { ...d[key], ...patch } }));
  };

  const pickIdentityFile = async (key: string) => {
    try {
      const home = await homeDir();
      const sshDir = await join(home, ".ssh");
      const result = await open({
        multiple: false,
        title: "Select SSH Identity File",
        defaultPath: sshDir,
      });
      if (typeof result === "string") {
        updateDetail(key, { identityFilePath: result });
      }
    } catch {
      // User cancelled — no action needed
    }
  };

  const startDetails = () => {
    const toImport = hosts.filter((h) => selected.has(hostKey(h)));
    setDetails((prev) => {
      const next = { ...prev };
      for (const host of toImport) {
        const key = hostKey(host);
        if (!next[key]) next[key] = detailsFromHost(host);
      }
      return next;
    });
    setStep("details");
  };

  const handleImport = async () => {
    const toImport = hosts.filter((h) => selected.has(hostKey(h)));
    if (toImport.length === 0) return;

    setImporting(true);
    setError(null);
    try {
      for (const host of toImport) {
        const detail = details[hostKey(host)] ?? detailsFromHost(host);

        let vaultCredentialId: string | undefined;
        if (detail.authMethod === "password" && detail.password.trim()) {
          vaultCredentialId = await vaultCommands.storeCredential(detail.password.trim());
        } else if (detail.authMethod === "key" && detail.passphrase.trim()) {
          vaultCredentialId = await vaultCommands.storeCredential(detail.passphrase.trim());
        }

        await serverCommands.createServer({
          displayName: host.hostname ?? host.ip,
          hostname: host.ip,
          port: detail.port,
          username: detail.username.trim() || undefined,
          authMethod: detail.authMethod,
          identityFilePath: detail.authMethod === "key" ? (detail.identityFilePath.trim() || undefined) : undefined,
          vaultCredentialId,
        });
      }
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
      className="fixed inset-0 bg-black/85 animate-backdrop-in flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface-1 border border-stroke-subtle rounded-xl shadow-overlay animate-overlay-in w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stroke-subtle shrink-0">
          <h2 className="text-lg font-semibold text-white">
            {step === "select" ? "Discover Hosts" : "Server Details"}
          </h2>
          <Button variant="ghost" size="icon-sm" onClick={onClose} className="text-muted hover:text-white" aria-label="Close">✕</Button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {error && (
            <p className="text-sm text-error bg-error-subtle border border-error-subtle rounded-md px-3 py-2">{error}</p>
          )}

          {imported !== null && (
            <p className="text-sm text-success bg-success-subtle border border-success-subtle rounded-md px-3 py-2">
              ✓ Added {imported} server{imported !== 1 ? "s" : ""} successfully.
            </p>
          )}

          {imported === null && step === "select" && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted">
                  Hosts from <span className="font-mono">~/.ssh/known_hosts</span> and your local network.
                </p>
                <Button
                  type="button"
                  onClick={() => { void scanLan(); }}
                  disabled={scanning}
                  className="h-10 shrink-0"
                >
                  {scanning
                    ? progress && progress.total > 0
                      ? `Scanning… ${progress.scanned}/${progress.total}`
                      : "Scanning…"
                    : "Scan network"}
                </Button>
              </div>

              {!loading && hosts.length === 0 && (
                <p className="text-sm text-muted text-center py-8">
                  No new hosts found. Try scanning your network.
                </p>
              )}

              {hosts.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-muted">
                      {selected.size} of {hosts.length} selected
                    </p>
                    <button
                      onClick={toggleAll}
                      className="text-xs text-accent hover:text-accent-hover"
                    >
                      {selected.size === hosts.length ? "Deselect all" : "Select all"}
                    </button>
                  </div>

                  <div className="border border-stroke-subtle rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-surface-2">
                        <tr className="border-b border-stroke-subtle">
                          <th className="w-10 px-3 py-2" />
                          <th className="text-left px-3 py-2 text-muted font-medium">Host</th>
                          <th className="text-left px-3 py-2 text-muted font-medium">Port</th>
                          <th className="text-left px-3 py-2 text-muted font-medium">Source</th>
                          <th className="text-left px-3 py-2 text-muted font-medium">User</th>
                          <th className="text-left px-3 py-2 text-muted font-medium">Key</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hosts.map((host) => {
                          const key = hostKey(host);
                          return (
                            <tr
                              key={key}
                              onClick={() => toggle(key)}
                              className={`cursor-pointer border-b border-stroke-subtle last:border-0 transition-colors ${
                                selected.has(key) ? "bg-accent/5" : "hover:bg-surface-2"
                              }`}
                            >
                              <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={selected.has(key)}
                                  onCheckedChange={() => toggle(key)}
                                />
                              </td>
                              <td className="px-3 py-2 font-mono text-white">{host.ip}</td>
                              <td className="px-3 py-2 text-muted">{host.port}</td>
                              <td className="px-3 py-2 text-muted">{SOURCE_LABELS[host.source]}</td>
                              <td className="px-3 py-2 text-muted font-mono text-xs">
                                {host.username ?? <span className="text-faint italic font-sans">—</span>}
                              </td>
                              <td className="px-3 py-2 text-muted font-mono text-xs" title={host.identityFilePath}>
                                {host.identityFilePath ? (
                                  <span>
                                    {host.identityFilePath.split("/").pop()}
                                    {host.needsPassphrase && (
                                      <span title="Key requires a passphrase" className="ml-1">🔒</span>
                                    )}
                                  </span>
                                ) : (
                                  <span className="text-faint italic font-sans">none</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {imported === null && step === "details" && (
            <div className="space-y-3">
              <p className="text-sm text-muted">
                Review and adjust connection details before adding {selected.size} server{selected.size !== 1 ? "s" : ""}.
              </p>
              {hosts.filter((h) => selected.has(hostKey(h))).map((host) => {
                const key = hostKey(host);
                const detail = details[key] ?? detailsFromHost(host);
                return (
                  <div key={key} className="border border-stroke-subtle rounded-lg p-3 space-y-3">
                    <p className="font-mono text-sm text-white">{host.hostname ?? host.ip}</p>

                    <div className="grid grid-cols-2 gap-3">
                      <DetailField label="Port">
                        <Input
                          type="number"
                          min={1}
                          max={65535}
                          value={detail.port}
                          onChange={(e) => updateDetail(key, { port: Number(e.target.value) })}
                          autoComplete="off"
                        />
                      </DetailField>
                      <DetailField label="Username">
                        <Input
                          value={detail.username}
                          onChange={(e) => updateDetail(key, { username: e.target.value })}
                          placeholder="ubuntu"
                          autoComplete="off"
                        />
                      </DetailField>
                    </div>

                    <DetailField label="Auth Method">
                      <div className="flex h-9 rounded border border-stroke overflow-hidden">
                        {(["key", "password"] as const).map((method) => (
                          <button
                            key={method}
                            type="button"
                            onClick={() => updateDetail(key, { authMethod: method })}
                            className={`flex-1 h-full text-sm transition-colors ${
                              detail.authMethod === method
                                ? "bg-accent text-black font-semibold"
                                : "bg-surface-3 text-muted hover:text-white hover:bg-surface-4"
                            }`}
                          >
                            {method === "key" ? "SSH Key" : "Password"}
                          </button>
                        ))}
                      </div>
                    </DetailField>

                    {detail.authMethod === "key" ? (
                      <>
                        <DetailField label="Identity File">
                          <div className="flex gap-2">
                            <Input
                              value={detail.identityFilePath}
                              onChange={(e) => updateDetail(key, { identityFilePath: e.target.value })}
                              placeholder="~/.ssh/id_ed25519"
                              className="flex-1"
                              autoComplete="off"
                            />
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => { void pickIdentityFile(key); }}
                              className="px-3 h-10 border border-stroke shrink-0"
                            >
                              Browse
                            </Button>
                          </div>
                        </DetailField>
                        <DetailField label="Passphrase (optional)">
                          {!vaultAvailable ? (
                            <p className="text-xs text-yellow-500">Unlock the vault to store a passphrase.</p>
                          ) : (
                            <Input
                              type="password"
                              value={detail.passphrase}
                              onChange={(e) => updateDetail(key, { passphrase: e.target.value })}
                              placeholder="Leave empty if the key has no passphrase"
                              autoComplete="new-password"
                            />
                          )}
                        </DetailField>
                      </>
                    ) : (
                      <DetailField label="Password">
                        {!vaultAvailable ? (
                          <p className="text-xs text-yellow-500">Unlock the vault to store a password.</p>
                        ) : (
                          <Input
                            type="password"
                            value={detail.password}
                            onChange={(e) => updateDetail(key, { password: e.target.value })}
                            placeholder="SSH password"
                            autoComplete="new-password"
                          />
                        )}
                      </DetailField>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-stroke-subtle shrink-0">
          {step === "details" && imported === null && (
            <Button
              variant="secondary"
              onClick={() => setStep("select")}
              className="h-10"
            >
              Back
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={onClose}
            className="h-10"
          >
            {imported !== null ? "Done" : "Cancel"}
          </Button>
          {step === "select" && hosts.length > 0 && imported === null && (
            <Button
              onClick={startDetails}
              disabled={selected.size === 0}
              className="h-10"
            >
              Continue
            </Button>
          )}
          {step === "details" && imported === null && (
            <Button
              onClick={() => { void handleImport(); }}
              disabled={importing}
              className="h-10"
            >
              {importing ? "Adding…" : `Add ${selected.size} server${selected.size !== 1 ? "s" : ""}`}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-secondary mb-1">{label}</label>
      {children}
    </div>
  );
}
