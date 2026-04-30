import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props { children: ReactNode; }
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
      return (
        <div className="flex h-screen items-center justify-center bg-black text-white p-8">
          <div className="max-w-md text-center">
            <p className="text-4xl mb-4 text-accent">⚠</p>
            <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
            <p className="text-[#777] text-sm mb-6 font-mono">{this.state.error.message}</p>
            <button
              onClick={() => this.setState({ error: null })}
              className="bg-accent hover:bg-accent-hover text-black font-semibold px-4 py-2 rounded transition-colors text-sm"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
