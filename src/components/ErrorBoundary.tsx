import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'An unexpected error occurred.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Application ErrorBoundary:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#101016] text-[#f5f4f8] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-[#1d1d26] border border-white/10 rounded-2xl p-6 text-center space-y-4">
            <h1 className="font-display text-xl font-bold">
              Something went wrong
            </h1>
            <p className="text-sm text-[#a5a3b2] leading-relaxed">
              Kakumiro Online TV encountered a temporary error while loading.
              Please reload to reconnect.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#ffd21f] hover:bg-[#ffe055] text-[#101016] text-sm font-bold transition-colors"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
