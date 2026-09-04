import { Edit, FileText, Minus, Plus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { FieldChange } from '@/types/audit';
import styles from './ChangesSummary.module.css';

interface ChangesSummaryProps {
  changes: FieldChange[];
  summary?: string;
}

const statKinds = [
  { type: 'added', icon: Plus, label: 'added' },
  { type: 'modified', icon: Edit, label: 'modified' },
  { type: 'removed', icon: Minus, label: 'removed' },
] as const;

export function ChangesSummary({ changes, summary }: ChangesSummaryProps) {
  const counts = {
    added: changes.filter((c) => c.type === 'added').length,
    modified: changes.filter((c) => c.type === 'modified').length,
    removed: changes.filter((c) => c.type === 'removed').length,
  };

  const total = counts.added + counts.modified + counts.removed;

  if (total === 0) {
    return (
      <Card className="pad-4">
        <div className={styles.empty}>
          <FileText className={styles.emptyIcon} />
          <span className="type-sm">No field changes detected</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="pad-4">
      <div className="stack space-3">
        {summary && <p className={styles.summary}>{summary}</p>}

        <div className={styles.stats}>
          {statKinds.map(({ type, icon: Icon, label }) =>
            counts[type] > 0 ? (
              <div
                key={type}
                className={styles.stat}
                data-type={type}
              >
                <div className={styles.badge}>
                  <Icon className={styles.badgeIcon} />
                </div>
                <span>
                  <span className={styles.value}>{counts[type]}</span>
                  <span className={styles.label}>{label}</span>
                </span>
              </div>
            ) : null,
          )}
        </div>
      </div>
    </Card>
  );
}
