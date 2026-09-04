import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import { Component, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import styles from './LightboxErrorBoundary.module.css';

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
        <div className={styles.root}>
          <div className={styles.panel}>
            <div className={styles.badge}>
              <AlertTriangle className={styles.badgeIcon} />
            </div>
            <div>
              <h2 className={styles.title}>Failed to load media</h2>
              <p className={styles.description}>
                Something went wrong while loading the file. This could be due to a network issue or an unsupported file format.
              </p>
            </div>
            <div className={styles.actions}>
              <Button
                variant="outline"
                onClick={this.handleRetry}
                className={styles.button}
              >
                <RefreshCw className={styles.buttonIcon} />
                Try again
              </Button>
              <Button
                variant="ghost"
                onClick={this.props.onClose}
                className={styles.buttonClose}
              >
                <X className={styles.buttonIcon} />
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
