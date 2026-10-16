import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RotateCcw, Home } from 'lucide-react';
import { formatErrorMessage } from '../utils/errors';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
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
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  public handleReload = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    } else {
      window.location.reload();
    }
  };

  public handleGoHome = () => {
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center p-6 text-center select-none">
          <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-8 shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-red-950/70 border border-red-800/80 text-red-400 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-medium mb-2 text-white font-serif">
              {this.props.fallbackTitle || 'Сталася помилка відображення'}
            </h2>
            <p className="text-xs text-neutral-400 mb-6 font-sans leading-relaxed">
              Компонент не зміг відобразитися. Ми зберегли ваші дані. Ви можете спробувати перезавантажити сторінку або повернутися на головний сайт.
            </p>
            {this.state.error && (
              <pre className="text-[11px] text-red-300 bg-black/50 border border-neutral-800 p-3 rounded mb-6 text-left overflow-x-auto max-h-32 font-mono whitespace-pre-wrap break-words">
                {formatErrorMessage(this.state.error, 'Невідома помилка виконання')}
              </pre>
            )}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                type="button"
                onClick={this.handleReload}
                className="px-4 py-2.5 bg-white text-black text-xs font-medium rounded-lg hover:bg-neutral-200 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Спробувати знову</span>
              </button>
              <button
                type="button"
                onClick={this.handleGoHome}
                className="px-4 py-2.5 bg-neutral-800 text-white text-xs font-medium rounded-lg hover:bg-neutral-700 transition-colors flex items-center justify-center gap-2 cursor-pointer border border-neutral-700"
              >
                <Home className="w-3.5 h-3.5" />
                <span>На головну</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
