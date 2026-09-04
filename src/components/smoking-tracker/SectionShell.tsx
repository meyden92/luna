import type { ComponentType, ReactNode } from 'react';
import styles from './SectionShell.module.css';

/** Titled panel used for every block of the tracker; `action` sits opposite the title. */
export function SectionShell({
  title,
  description,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.root}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <span className={styles.iconBox}>
            <Icon className={styles.icon} />
          </span>
          <div>
            <h2 className={styles.title}>{title}</h2>
            <p className={styles.description}>{description}</p>
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
