import type { ReactNode } from 'react';
import styles from './AiRail.module.css';

interface AiRailProps {
  /** Rail header label, e.g. "Generate Settings". */
  title: string;
  /** Pinned footer slot — the primary action button (+ optional hint). */
  footer: ReactNode;
  /** Scrollable settings content. */
  children: ReactNode;
}

/**
 * Left settings rail for the AI workspace. A self-contained flex column:
 * a pinned header, an independently scrolling body, and a pinned footer.
 * Height containment starts at 768px so the rail flows naturally (no
 * zero-height collapse) on mobile, where the page scrolls as a whole.
 */
export function AiRail({ title, footer, children }: AiRailProps) {
  return (
    <aside className={styles.rail}>
      <div className={styles.header}>
        <span className={styles.dot} />
        <h2 className={styles.title}>{title}</h2>
      </div>

      <div className={`stack space-6 ${styles.body}`}>{children}</div>

      <div className={styles.footer}>{footer}</div>
    </aside>
  );
}
