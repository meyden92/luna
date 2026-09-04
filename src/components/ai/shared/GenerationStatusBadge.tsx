import { Badge } from '@/components/ui/badge';
import type { GenerationStatus } from '@/hooks/stores/image-editor-queue-store';
import { cn } from '@/libs/utils';
import styles from './GenerationStatusBadge.module.css';

interface GenerationStatusBadgeProps {
  status: GenerationStatus;
  className?: string;
}

const statusConfig: Record<
  GenerationStatus,
  {
    label: string;
    variant: 'default' | 'secondary' | 'destructive' | 'outline';
    pulse?: boolean;
    /** Semantic colour role for the leading dot. */
    tone: 'warning' | 'info' | 'success' | 'destructive';
  }
> = {
  queued: {
    label: 'In Queue',
    variant: 'outline',
    tone: 'warning',
  },
  uploading: {
    label: 'Uploading',
    variant: 'secondary',
    pulse: true,
    tone: 'info',
  },
  processing: {
    label: 'Processing',
    variant: 'secondary',
    pulse: true,
    tone: 'info',
  },
  succeeded: {
    label: 'Complete',
    variant: 'default',
    tone: 'success',
  },
  failed: {
    label: 'Failed',
    variant: 'destructive',
    tone: 'destructive',
  },
};

export function GenerationStatusBadge({ status, className }: GenerationStatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <Badge
      variant={config.variant}
      className={cn(styles.badge, className)}
    >
      <span
        className={styles.dot}
        data-tone={config.tone}
        data-pulse={config.pulse ? '' : undefined}
      />
      {config.label}
    </Badge>
  );
}
