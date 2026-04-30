import { useUiStore } from "../../store/uiStore";

export default function TopBar() {
  const openAdd = useUiStore((s) => s.openAdd);

  return (
    <header className="h-14 shrink-0 border-b border-gray-700 bg-gray-800 flex items-center px-4 gap-3">
      <input
        className="flex-1 max-w-sm bg-gray-700 border border-gray-600 rounded-md px-3 py-1.5 text-sm text-gray-300 placeholder-gray-500 focus:outline-none cursor-not-allowed opacity-60"
        placeholder="Search servers… (coming in Phase 1F)"
        disabled
      />
      <button
        onClick={openAdd}
        className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-1.5 rounded-md transition-colors shrink-0"
      >
        + Add Server
      </button>
    </header>
  );
}
