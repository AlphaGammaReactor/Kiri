/**
 * Kiri — Global Error Boundary
 *
 * Catches React render crashes and displays a recovery UI with
 * crash reporting capability. Sends structured reports to the backend.
 * Supports per-module scoping and bilingual error messages via i18n.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

interface ErrorBoundaryProps {
  children: ReactNode;
  moduleName?: string;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  reported: boolean;
}

class ErrorBoundaryClass extends Component<
  ErrorBoundaryProps & { t: TFunction },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
    reported: false,
  };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });

    console.error(
      `[Kiri ErrorBoundary] Module: ${this.props.moduleName || 'unknown'}`,
      error,
      errorInfo
    );

    // Auto-report to backend
    this.reportCrash(error, errorInfo);
  }

  private async reportCrash(error: Error, errorInfo: ErrorInfo) {
    try {
      await fetch('/api/crash-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exception_type: error.name,
          exception_message: error.message,
          traceback: errorInfo.componentStack || '',
          endpoint: window.location.pathname,
          method: 'REACT_RENDER',
          severity: 'critical',
          module: this.props.moduleName || 'unknown',
          user_agent: navigator.userAgent,
          context: {
            url: window.location.href,
            timestamp: new Date().toISOString(),
          },
        }),
      });
      this.setState({ reported: true });
    } catch {
      // Silently fail — don't crash the crash handler
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, reported: false });
  };

  private handleGoHome = () => {
    window.location.href = '/projects';
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { t, moduleName } = this.props;
      const { error, errorInfo } = this.state;

      return (
        <div className="flex flex-col items-center justify-center min-h-[300px] p-8">
          <div className="max-w-lg w-full bg-kiri-surface border border-rose-500/30 rounded-xl p-6 text-center shadow-lg shadow-rose-500/5">
            {/* Error icon */}
            <div className="text-4xl mb-4">🌿</div>

            <h2 className="text-lg font-bold text-rose-400 mb-2">
              {t("errors.crash_title", "Something went wrong")}
            </h2>

            {moduleName && (
              <p className="text-sm text-kiri-text-muted mb-1">
                {t("errors.crash_module", "Module")}: <span className="font-mono text-kiri-accent">{moduleName}</span>
              </p>
            )}

            <p className="text-sm text-kiri-text-muted mb-4">
              {t("errors.crash_description", "Kiri encountered an unexpected error. A crash report has been automatically submitted.")}
            </p>

            {/* Error details (collapsible) */}
            {error && (
              <details className="text-left mb-4">
                <summary className="text-xs text-kiri-text-dim cursor-pointer hover:text-kiri-text-muted transition-colors">
                  {t("errors.technical_details", "Error details")}
                </summary>
                <pre className="mt-2 text-xs font-mono text-rose-300 bg-kiri-bg rounded p-3 overflow-x-auto max-h-40 overflow-y-auto border border-kiri-border">
                  {error.name}: {error.message}
                  {errorInfo?.componentStack && `\n\nComponent Stack:${errorInfo.componentStack}`}
                </pre>
              </details>
            )}

            {/* Recovery actions */}
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleRetry}
                className="px-4 py-2 text-sm rounded-lg bg-kiri-accent text-kiri-bg font-medium hover:brightness-110 transition"
              >
                {t("common.retry", "Retry")}
              </button>
              <button
                onClick={this.handleGoHome}
                className="px-4 py-2 text-sm rounded-lg border border-kiri-border text-kiri-text-muted hover:text-kiri-text hover:border-kiri-border-focus transition"
              >
                {t("errors.back_to_projects", "Back to Projects")}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Wrapper to inject the i18n `t` function into the class-based ErrorBoundary.
 * Usage:
 *   <ErrorBoundary moduleName="Atlas">
 *     <AtlasPage />
 *   </ErrorBoundary>
 */
export function ErrorBoundary({ children, moduleName, fallback }: ErrorBoundaryProps) {
  const { t } = useTranslation();
  return (
    <ErrorBoundaryClass t={t} moduleName={moduleName} fallback={fallback}>
      {children}
    </ErrorBoundaryClass>
  );
}

export default ErrorBoundaryClass;
