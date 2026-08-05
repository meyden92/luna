import { cn } from '@/libs/utils';
import type { FieldChange } from '@/types/audit';
import { ChangeIndicator } from './ChangeIndicator';
import { JsonDiff } from './JsonDiff';

interface FieldDiffProps {
  change: FieldChange;
  className?: string;
}

export function FieldDiff({ change, className }: FieldDiffProps) {
  const getFieldName = (path: string): string => {
    // Convert camelCase to readable format
    const parts = path.split('.');
    const lastPart = parts[parts.length - 1] || path;
    const formatted = lastPart
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
    return formatted;
  };

  return (
    <div className={cn('rounded-lg border bg-card p-4', className)}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{getFieldName(change.path)}</span>
          <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{change.path}</code>
        </div>
        <ChangeIndicator type={change.type} />
      </div>

      {/* Split view layout for all change types */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        {/* Left side - Before/Original */}
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">{change.type === 'added' ? 'Original' : 'Before'}</div>
          <div
            className={cn(
              'p-2 rounded border min-h-[2.5rem] flex items-start',
              change.type === 'added' ? 'bg-muted/50 text-muted-foreground border-border' : 'border-red-500/20',
            )}
          >
            {change.type === 'added' ? (
              <span className="italic text-muted-foreground font-mono text-sm">(no previous value)</span>
            ) : (
              <JsonDiff
                before={change.before}
                after={change.after}
                side="before"
                className="w-full"
              />
            )}
          </div>
        </div>

        {/* Right side - After/New */}
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">{change.type === 'removed' ? 'Current' : 'After'}</div>
          <div
            className={cn(
              'p-2 rounded border min-h-[2.5rem] flex items-start',
              change.type === 'removed' ? 'bg-muted/50 text-muted-foreground border-border' : 'border-emerald-500/20',
            )}
          >
            {change.type === 'removed' ? (
              <span className="italic text-muted-foreground font-mono text-sm">(value removed)</span>
            ) : (
              <JsonDiff
                before={change.before}
                after={change.after}
                side="after"
                className="w-full"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
