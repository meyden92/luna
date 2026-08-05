import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import { Component, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

interface LightboxErrorBoundaryProps {
  children: ReactNode;
  onClose: () => void;
}

interface LightboxErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class LightboxErrorBoundary extends Component<LightboxErrorBoundaryProps, LightboxErrorBoundaryState> {
  constructor(props: LightboxErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): LightboxErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Lightbox error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  override render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95">
          <div className="flex flex-col items-center gap-6 p-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/20">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-white">Failed to load media</h2>
              <p className="max-w-md text-sm text-white/60">
                Something went wrong while loading the file. This could be due to a network issue or an unsupported file format.
              </p>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={this.handleRetry}
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Try again
              </Button>
              <Button
                variant="ghost"
                onClick={this.props.onClose}
                className="gap-2 text-white/80 hover:text-white"
              >
                <X className="h-4 w-4" />
                Close
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
