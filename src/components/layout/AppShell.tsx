import { useEffect } from "react";
import { useServerStore } from "../../store/serverStore";
import { useUiStore } from "../../store/uiStore";
import { useVaultStore } from "../../store/vaultStore";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import ServerList from "../servers/ServerList";
import ServerForm from "../servers/ServerForm";
import VaultLockScreen from "../vault/VaultLockScreen";
import VaultSetupModal from "../vault/VaultSetupModal";

export default function AppShell() {
  const fetchAll = useServerStore((s) => s.fetchAll);
  const activeView = useUiStore((s) => s.activeView);
  const { isSetup, isUnlocked, isChecking, setupDismissed, check } = useVaultStore();

  useEffect(() => {
    void fetchAll();
    void check();
  }, [fetchAll, check]);

  if (isChecking) {
    return (
      <div className="flex h-screen items-center justify-center bg-black text-[#555] text-sm">
        Loading…
      </div>
    );
  }

  if (isSetup && !isUnlocked) return <VaultLockScreen />;

  return (
    <div className="flex h-screen bg-black text-white overflow-hidden">
      <Sidebar />

      <div className="flex flex-col flex-1 min-w-0">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-5">
          <ServerList />
        </main>
      </div>

      {(activeView === "add" || activeView === "edit") && <ServerForm />}
      {!isSetup && !setupDismissed && <VaultSetupModal />}
    </div>
  );
}
