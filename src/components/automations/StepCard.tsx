import { Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import styles from './StepCard.module.css';

type StepCardProps = {
  /** A lucide glyph for the tile; the trigger tile is tinted, steps are neutral. */
  icon: ReactNode;
  /** The uppercase kind label: "When", "Only if", "Move to folder". */
  kind: string;
  tone?: 'default' | 'trigger';
  /** Omitted for the trigger, which cannot be removed. */
  onRemove?: () => void;
  children: ReactNode;
};

/**
 * One card in the chain — the trigger and every step share this shell, so the
 * icon tile, kind label and field row line up down the column.
 */
function StepCard({ icon, kind, tone = 'default', onRemove, children }: StepCardProps) {
  return (
    <div
      className={styles.root}
      data-tone={tone}
    >
      <div className={styles.tile}>{icon}</div>
      <div>
        <div className={styles.kind}>{kind}</div>
        <div className={styles.fields}>{children}</div>
      </div>
      {onRemove ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove the "${kind}" step`}
          onClick={onRemove}
        >
          <Trash2 />
        </Button>
      ) : null}
    </div>
  );
}

export { StepCard };
