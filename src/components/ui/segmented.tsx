import * as React from 'react';
import { useIsomorphicLayoutEffect } from '@/hooks/use-isomorphic-layout-effect';
import { cn } from '@/libs/utils';
import styles from './segmented.module.css';

type SegmentedItem<TValue extends string> = {
  value: TValue;
  label: React.ReactNode;
  /** Native tooltip, used where the label is an abbreviation ("16:9" → "1344×768"). */
  title?: string;
  disabled?: boolean;
};

type SegmentedProps<TValue extends string> = Omit<React.ComponentProps<'div'>, 'onChange'> & {
  items: readonly SegmentedItem<TValue>[];
  value: TValue;
  onValueChange: (value: TValue) => void;
  /** Names the group for assistive technology; the options themselves are pressed toggles. */
  label: string;
};

/**
 * A row of mutually exclusive options with one pill that slides between them.
 *
 * The pill is a single element measured from whichever option is active, so the
 * travel is continuous rather than a cross-fade between two backgrounds. It is
 * only rendered once measured — `data-measured` then enables the transition, so
 * the first paint does not animate in from the left edge.
 *
 * Used by the Files type filter, the Generate shape and count controls, the
 * visibility choice, and template dropdown variables.
 */
function Segmented<TValue extends string>({ items, value, onValueChange, label, className, ...props }: SegmentedProps<TValue>) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [pill, setPill] = React.useState<{ x: number; width: number } | null>(null);

  const measure = React.useCallback(() => {
    const active = rootRef.current?.querySelector<HTMLElement>('button[data-active]');
    setPill(active ? { x: active.offsetLeft, width: active.offsetWidth } : null);
  }, []);

  useIsomorphicLayoutEffect(measure, [measure, value, items.length]);

  // A font swap or a resized container moves the options without changing state.
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    document.fonts?.ready.then(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    for (const child of root.children) observer.observe(child);
    return () => observer.disconnect();
  }, [measure]);

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={label}
      data-slot="segmented"
      data-measured={pill ? '' : undefined}
      className={cn(styles.root, className)}
      {...props}
    >
      {pill && (
        <span
          aria-hidden
          className={styles.pill}
          style={{ translate: `${pill.x}px 0`, width: pill.width }}
        />
      )}
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          title={item.title}
          disabled={item.disabled}
          aria-pressed={item.value === value}
          data-active={item.value === value || undefined}
          className={styles.option}
          onClick={() => onValueChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export { Segmented, type SegmentedItem };
