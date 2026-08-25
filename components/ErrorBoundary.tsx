import React, { Component, ErrorInfo, ReactNode } from 'react';
import { InfoIcon, RefreshCwIcon } from './icons';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  componentName?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`ErrorBoundary caught an error in [${this.props.componentName || 'Component'}]:`, error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="p-4 my-2 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive text-sm flex flex-col gap-2">
          <div className="flex items-center gap-2 font-semibold">
            <InfoIcon className="w-4 h-4 flex-shrink-0" />
            <span>Failed to render {this.props.componentName || 'content'}</span>
          </div>
          {this.state.error?.message && (
            <pre className="text-xs font-mono bg-background/50 p-2 rounded max-h-24 overflow-auto border border-destructive/20 whitespace-pre-wrap break-all text-muted-foreground">
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={this.handleReset}
            className="self-start text-xs font-medium px-2.5 py-1 rounded bg-secondary hover:bg-accent text-foreground transition-colors flex items-center gap-1 mt-1 shadow-sm border"
          >
            <RefreshCwIcon className="w-3 h-3" /> Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
