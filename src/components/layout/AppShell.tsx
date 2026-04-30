import { useEffect } from "react";
import { useServerStore } from "../../store/serverStore";
import { useUiStore } from "../../store/uiStore";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import ServerList from "../servers/ServerList";
import ServerForm from "../servers/ServerForm";

export default function AppShell() {
  const fetchAll = useServerStore((s) => s.fetchAll);
  const activeView = useUiStore((s) => s.activeView);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100 overflow-hidden">
      <Sidebar />

      <div className="flex flex-col flex-1 min-w-0">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-5">
          <ServerList />
        </main>
      </div>

      {(activeView === "add" || activeView === "edit") && <ServerForm />}
    </div>
  );
}
