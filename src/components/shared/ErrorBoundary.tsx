import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "../ui/button";

interface Props {
  children: ReactNode;
  /** Renders a compact inline error instead of taking over the full screen. */
  inline?: boolean;
}
interface State { error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      if (this.props.inline) {
        return (
          <div className="flex flex-col items-center justify-center gap-2 p-4 text-center text-sm text-muted">
            <p className="font-medium text-red-400">Failed to load</p>
            <p className="font-mono text-xs opacity-70">{this.state.error.message}</p>
            <Button size="sm" variant="outline" onClick={() => this.setState({ error: null })}>
              Retry
            </Button>
          </div>
        );
      }
      return (
        <div className="flex h-screen items-center justify-center bg-black text-white p-8">
          <div className="max-w-md text-center">
            <p className="text-4xl mb-4 text-accent">⚠</p>
            <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
            <p className="text-muted text-sm mb-6 font-mono">{this.state.error.message}</p>
            <Button size="lg" onClick={() => this.setState({ error: null })}>
              Try again
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
