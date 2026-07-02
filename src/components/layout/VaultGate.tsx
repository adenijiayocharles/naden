import { Suspense, lazy } from "react";
import { useVaultStore } from "../../store/vaultStore";
import VaultLockScreen from "../vault/VaultLockScreen";

const VaultSetupModal = lazy(() => import("../vault/VaultSetupModal"));

/**
 * Renders children only when the vault is ready and unlocked.
 * Must be used INSIDE AppShell so initialization hooks run first —
 * useAppInit populates the vault state that this component reads.
 */
export default function VaultGate({ children }: { children: React.ReactNode }) {
  const isSetup = useVaultStore((s) => s.isSetup);
  const isUnlocked = useVaultStore((s) => s.isUnlocked);
  const isChecking = useVaultStore((s) => s.isChecking);
  const isPasswordRequired = useVaultStore((s) => s.isPasswordRequired);

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
  if (isSetup && !isUnlocked && isPasswordRequired) return <VaultLockScreen />;
  return <>{children}</>;
}
