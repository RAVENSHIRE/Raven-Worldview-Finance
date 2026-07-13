import { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  label?: string; // shown in the fallback so the operator knows which panel failed
}

interface ErrorBoundaryState {
  error: Error | null;
}

// Isolates a subtree so a single panel throwing (e.g. a missing API key, a
// WebGL failure) degrades to a compact card instead of unmounting the entire
// dashboard and leaving a black screen.
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.label ? ':' + this.props.label : ''}]`, error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="h-full w-full flex flex-col items-center justify-center gap-2 p-4 text-center bg-terminal-panel/40 border border-terminal-red/30 rounded-sm">
          <span className="text-[9px] font-black uppercase tracking-widest text-terminal-red">
            {this.props.label || 'PANEL'}_OFFLINE
          </span>
          <p className="text-[8px] text-white/40 font-mono leading-tight uppercase max-w-[240px]">
            {this.state.error.message || 'Render fault isolated. Dashboard remains operational.'}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-1 px-2 py-1 text-[8px] font-black uppercase tracking-widest border border-terminal-line text-terminal-text-secondary hover:border-terminal-cyan hover:text-white transition-colors rounded-sm"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
