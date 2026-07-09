import { Suspense, lazy } from "react";
import { useVaultStore, useVaultLocked } from "../../store/vaultStore";
import VaultLockScreen from "../vault/VaultLockScreen";

const VaultSetupModal = lazy(() => import("../vault/VaultSetupModal"));

/**
 * Gates interaction with children until the vault is ready and unlocked, covering
 * them with VaultLockScreen while locked. Children stay mounted throughout (see
 * `locked` below) rather than being unmounted, so open sessions aren't lost.
 * Must be used INSIDE AppShell so initialization hooks run first —
 * useAppInit populates the vault state that this component reads.
 */
export default function VaultGate({ children }: { children: React.ReactNode }) {
  const isSetup = useVaultStore((s) => s.isSetup);
  const isChecking = useVaultStore((s) => s.isChecking);
  const isPasswordRequired = useVaultStore((s) => s.isPasswordRequired);
  const locked = useVaultLocked();

  if (isChecking) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-base text-muted text-sm">
        Loading…
      </div>
    );
  }
  if (!isSetup && isPasswordRequired) {
    return (
      <Suspense fallback={null}>
        <VaultSetupModal />
      </Suspense>
    );
  }

  // Keep children mounted even while locked, so open terminal/SFTP sessions and their
  // in-progress UI state (split panes, hidden peer sessions, scroll position) survive
  // an auto-lock instead of being torn down — VaultLockScreen fully covers them until unlock.
  return (
    <>
      <div className={locked ? "hidden" : "contents"}>{children}</div>
      {locked && <VaultLockScreen />}
    </>
  );
}
