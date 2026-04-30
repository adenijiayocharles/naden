import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

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
        <div className="flex h-screen items-center justify-center bg-gray-950 text-white p-8">
          <div className="max-w-md text-center">
            <p className="text-4xl mb-4">⚠️</p>
            <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
            <p className="text-gray-400 text-sm mb-6 font-mono">
              {this.state.error.message}
            </p>
            <button
              onClick={() => this.setState({ error: null })}
              className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-md text-sm transition-colors"
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
