import type { ComponentType } from 'react';
import styles from './MetricCard.module.css';

export type MetricTone = 'danger' | 'success' | 'info' | 'warning' | 'neutral';

/** Single headline number with a supporting detail line; the tone tints the card. */
export function MetricCard({
  title,
  value,
  detail,
  icon: Icon,
  tone = 'neutral',
}: {
  title: string;
  value: string;
  detail: string;
  icon: ComponentType<{ className?: string }>;
  tone?: MetricTone;
}) {
  return (
    <div
      className={styles.root}
      data-tone={tone}
    >
      <div className={styles.header}>
        <p className={styles.title}>{title}</p>
        <span className={styles.iconBox}>
          <Icon className={styles.icon} />
        </span>
      </div>
      <div className={styles.value}>{value}</div>
      <p className={styles.detail}>{detail}</p>
    </div>
  );
}
