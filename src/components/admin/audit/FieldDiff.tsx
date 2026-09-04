import { cn } from '@/libs/utils';
import type { FieldChange } from '@/types/audit';
import { ChangeIndicator } from './ChangeIndicator';
import styles from './FieldDiff.module.css';
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
    <div className={cn(styles.root, className)}>
      <div className={styles.head}>
        <div className="cluster space-2">
          <span className={styles.name}>{getFieldName(change.path)}</span>
          <code className={styles.path}>{change.path}</code>
        </div>
        <ChangeIndicator type={change.type} />
      </div>

      {/* Split view layout for all change types */}
      <div className={styles.split}>
        {/* Left side - Before/Original */}
        <div className="stack space-1">
          <div className={styles.sideLabel}>{change.type === 'added' ? 'Original' : 'Before'}</div>
          <div
            className={styles.valueBox}
            data-side={change.type === 'added' ? 'absent' : 'before'}
          >
            {change.type === 'added' ? (
              <span className={styles.absentValue}>(no previous value)</span>
            ) : (
              <JsonDiff
                before={change.before}
                after={change.after}
                side="before"
              />
            )}
          </div>
        </div>

        {/* Right side - After/New */}
        <div className="stack space-1">
          <div className={styles.sideLabel}>{change.type === 'removed' ? 'Current' : 'After'}</div>
          <div
            className={styles.valueBox}
            data-side={change.type === 'removed' ? 'absent' : 'after'}
          >
            {change.type === 'removed' ? (
              <span className={styles.absentValue}>(value removed)</span>
            ) : (
              <JsonDiff
                before={change.before}
                after={change.after}
                side="after"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
