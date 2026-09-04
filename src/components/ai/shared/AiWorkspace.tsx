import type { ReactNode } from 'react';
import styles from './AiWorkspace.module.css';

interface AiWorkspaceProps {
  /** Left settings rail (an <AiRail> element). */
  rail: ReactNode;
  /** Compact page title shown above the results pane. */
  title: string;
  /** One-line descriptor under the title. */
  subtitle: string;
  /** Results / gallery content for the right pane. */
  children: ReactNode;
}

/**
 * Two-column AI workspace: a fixed settings rail and an independently
 * scrolling results pane. From 768px up the grid fills its bounded parent and
 * each column scrolls on its own; below that it stacks and scrolls as one page.
 */
export function AiWorkspace({ rail, title, subtitle, children }: AiWorkspaceProps) {
  return (
    <div className={styles.workspace}>
      {rail}

      <section className={styles.main}>
        <div
          aria-hidden="true"
          className={`${styles.edge} ${styles.edgeStart}`}
        />
        <div
          aria-hidden="true"
          className={`${styles.edge} ${styles.edgeEnd}`}
        />

        <header className={styles.header}>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.subtitle}>{subtitle}</p>
        </header>

        <div className={styles.content}>{children}</div>
      </section>
    </div>
  );
}
