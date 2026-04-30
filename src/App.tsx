import AppShell from "./components/layout/AppShell";
import { ErrorBoundary } from "./components/shared/ErrorBoundary";

export default function App() {
  return (
    <ErrorBoundary>
      <AppShell />
    </ErrorBoundary>
  );
}
