import { ArrowRight, Minus, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/libs/utils';
import styles from './ChangeIndicator.module.css';

interface ChangeIndicatorProps {
  type: 'added' | 'modified' | 'removed';
  className?: string;
}

const config = {
  added: { icon: Plus, label: 'Added' },
  modified: { icon: ArrowRight, label: 'Modified' },
  removed: { icon: Minus, label: 'Removed' },
} as const;

export function ChangeIndicator({ type, className }: ChangeIndicatorProps) {
  const { icon: Icon, label } = config[type];

  return (
    <Badge
      variant="outline"
      data-type={type}
      className={cn(styles.root, className)}
    >
      <Icon className={styles.icon} />
      {label}
    </Badge>
  );
}
