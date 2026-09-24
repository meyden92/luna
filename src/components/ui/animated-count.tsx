import type * as React from 'react';
import { cn } from '@/libs/utils';
import styles from './animated-count.module.css';

/**
 * `@property` and `CSS.registerProperty` ship together, so this answers whether
 * the registered `--n` in motion.css exists and can therefore be transitioned.
 * Computed once: it cannot change within a session, and it must be false during
 * SSR so the server and the first client render agree.
 */
const canTweenIntegers = typeof CSS !== 'undefined' && typeof CSS.registerProperty === 'function';

/**
 * A number that ticks to its new value instead of jumping — folder counts as
 * files move between folders, and "N selected" in the selection bar.
 *
 * The visible digits come from a CSS counter fed by the registered `--n`
 * custom property, which is what makes them interpolable. That leaves no text
 * for a screen reader, so the real number is always the accessible name.
 * Without `@property` the number is rendered as plain text.
 */
function AnimatedCount({ value, className, ...props }: React.ComponentProps<'span'> & { value: number }) {
  if (!canTweenIntegers) {
    return (
      <span
        className={cn(styles.root, className)}
        {...props}
      >
        {value}
      </span>
    );
  }

  return (
    <span
      role="text"
      aria-label={String(value)}
      style={{ '--n': value } as React.CSSProperties}
      className={cn(styles.root, styles.tweened, className)}
      {...props}
    />
  );
}

export { AnimatedCount };
