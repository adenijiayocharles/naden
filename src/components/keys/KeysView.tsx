import { useEffect, useMemo, useState } from "react";
import { useSshKeyStore } from "../../store/sshKeyStore";
import { useServerStore } from "../../store/serverStore";
import type { SshKey } from "../../types/sshKey";
import { Button } from "../ui/button";
import EmptyState from "../shared/EmptyState";
import ConfirmDeleteModal from "../shared/ConfirmDeleteModal";
import AddKeyModal from "./AddKeyModal";
import GenerateKeyModal from "./GenerateKeyModal";
import ViewPublicKeyModal from "./ViewPublicKeyModal";
import KeyRow from "./KeyRow";

export default function KeysView() {
  const keys = useSshKeyStore((s) => s.keys);
  const isLoading = useSshKeyStore((s) => s.isLoading);
  const error = useSshKeyStore((s) => s.error);
  const load = useSshKeyStore((s) => s.load);
  const removeKey = useSshKeyStore((s) => s.removeKey);

  const servers = useServerStore((s) => s.servers);

  const [showAdd, setShowAdd] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SshKey | null>(null);
  const [viewPubTarget, setViewPubTarget] = useState<SshKey | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { void load(); }, [load]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await removeKey(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const usageByPath = useMemo(() => {
    const map = new Map<string, number>();
    for (const server of servers) {
      if (server.identityFilePath) {
        map.set(server.identityFilePath, (map.get(server.identityFilePath) ?? 0) + 1);
      }
    }
    return map;
  }, [servers]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-stroke-subtle shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-white">Vault</h1>
          <p className="text-sm text-faint mt-0.5">Manage private keys used for authentication</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setShowGenerate(true)}>
            <svg className="w-3.5 h-3.5 mr-1.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2v12M2 8h12" />
            </svg>
            Generate
          </Button>
          <Button onClick={() => setShowAdd(true)}>
            <svg className="w-3.5 h-3.5 mr-1.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2v12M2 8h12" />
            </svg>
            Add Existing
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-faint">Loading…</p>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-error">{error}</p>
          </div>
        ) : keys.length === 0 ? (
          <EmptyState
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 2a4 4 0 100 8 4 4 0 000-8zM6.5 7.5L2 12" />
              </svg>
            }
            heading="No keys in vault"
            subline="Add an existing private key or generate a new one."
            action={{ label: "Add Existing Key", onClick: () => setShowAdd(true) }}
          />
        ) : (
          <div className="p-6 flex flex-col gap-2">
            {keys.map((k) => (
              <KeyRow
                key={k.id}
                sshKey={k}
                usageCount={usageByPath.get(k.keyPath) ?? 0}
                onDelete={() => setDeleteTarget(k)}
                onViewPub={() => setViewPubTarget(k)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showAdd && <AddKeyModal onClose={() => setShowAdd(false)} />}
      {showGenerate && <GenerateKeyModal onClose={() => setShowGenerate(false)} />}
      {viewPubTarget && (
        <ViewPublicKeyModal
          sshKey={viewPubTarget}
          onClose={() => setViewPubTarget(null)}
        />
      )}
      {deleteTarget && (
        <ConfirmDeleteModal
          title="Remove key from vault?"
          description={
            <>
              <strong className="text-white">{deleteTarget.name}</strong> will be removed from the key registry.{" "}
              The key file at <code className="font-mono text-xs">{deleteTarget.keyPath}</code> is not deleted from disk.
            </>
          }
          confirmLabel="Remove"
          busy={deleting}
          onConfirm={() => { void handleDelete(); }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
