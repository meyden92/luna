import { Badge } from '@/components/ui/badge';
import type { GenerationStatus } from '@/hooks/stores/image-editor-queue-store';
import { cn } from '@/libs/utils';

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
    dotColor: string;
  }
> = {
  queued: {
    label: 'In Queue',
    variant: 'outline',
    dotColor: 'bg-yellow-500',
  },
  uploading: {
    label: 'Uploading',
    variant: 'secondary',
    pulse: true,
    dotColor: 'bg-blue-500',
  },
  processing: {
    label: 'Processing',
    variant: 'secondary',
    pulse: true,
    dotColor: 'bg-blue-500',
  },
  succeeded: {
    label: 'Complete',
    variant: 'default',
    dotColor: 'bg-green-500',
  },
  failed: {
    label: 'Failed',
    variant: 'destructive',
    dotColor: 'bg-red-500',
  },
};

export function GenerationStatusBadge({ status, className }: GenerationStatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <Badge
      variant={config.variant}
      className={cn('gap-1.5', className)}
    >
      <span className={cn('w-2 h-2 rounded-full', config.dotColor, config.pulse && 'animate-pulse')} />
      {config.label}
    </Badge>
  );
}
