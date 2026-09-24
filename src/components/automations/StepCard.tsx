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
  /**
   * A `view-transition-name` unique to this card, so the surviving cards glide to
   * their new positions when one is added or removed instead of jumping.
   *
   * Inline rather than motion.css's `data-vt-name`/`--vt-name` pair: that rule is
   * scoped to `html[data-vt="gallery"]` and the chain transitions as a `page`.
   * Safe to keep live permanently here — the chain holds a handful of cards, not
   * the hundreds that made the gallery's names opt-in for the duration only.
   */
  vtName?: string;
  /** Omitted for the trigger, which cannot be removed. */
  onRemove?: () => void;
  children: ReactNode;
};

/**
 * One card in the chain — the trigger and every step share this shell, so the
 * icon tile, kind label and field row line up down the column.
 */
function StepCard({ icon, kind, tone = 'default', vtName, onRemove, children }: StepCardProps) {
  return (
    <div
      className={styles.root}
      data-tone={tone}
      style={vtName ? { viewTransitionName: vtName } : undefined}
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
