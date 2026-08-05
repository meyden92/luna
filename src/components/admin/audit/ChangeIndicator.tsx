import { ArrowRight, Minus, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/libs/utils';

interface ChangeIndicatorProps {
  type: 'added' | 'modified' | 'removed';
  className?: string;
}

export function ChangeIndicator({ type, className }: ChangeIndicatorProps) {
  const config = {
    added: {
      icon: Plus,
      label: 'Added',
      className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    },
    modified: {
      icon: ArrowRight,
      label: 'Modified',
      className: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    },
    removed: {
      icon: Minus,
      label: 'Removed',
      className: 'bg-red-500/10 text-red-600 border-red-500/20',
    },
  };

  const { icon: Icon, label, className: badgeClassName } = config[type];

  return (
    <Badge
      variant="outline"
      className={cn(badgeClassName, className)}
    >
      <Icon className="mr-1 h-3 w-3" />
      {label}
    </Badge>
  );
}
