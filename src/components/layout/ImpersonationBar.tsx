import { X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useImpersonation } from '@/hooks/use-impersonation';
import styles from './ImpersonationBar.module.css';

export function ImpersonationBar() {
  const { isImpersonating, impersonatedUser, stopImpersonation, isLoading } = useImpersonation();

  if (isLoading || !isImpersonating) {
    return null;
  }

  const handleStopImpersonation = async () => {
    try {
      await stopImpersonation();
      toast.success('Impersonation stopped successfully');
    } catch (_error) {
      toast.error('Failed to stop impersonation');
    }
  };

  return (
    <div className={styles.root}>
      <div className={styles.inner}>
        <div className="cluster space-2">
          <span className="weight-medium">Impersonating user: {impersonatedUser}</span>
        </div>
        <Button
          onClick={handleStopImpersonation}
          variant="ghost"
          size="sm"
          className={styles.stop}
        >
          <X className={styles.icon} />
          Stop Impersonating
        </Button>
      </div>
    </div>
  );
}
