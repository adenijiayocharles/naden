import AppShell from "./components/layout/AppShell";
import { ErrorBoundary } from "./components/shared/ErrorBoundary";
import GlobalHostKeyModal from "./components/shared/GlobalHostKeyModal";

export default function App() {
  return (
    <ErrorBoundary>
      <AppShell />
      <GlobalHostKeyModal />
    </ErrorBoundary>
  );
}
