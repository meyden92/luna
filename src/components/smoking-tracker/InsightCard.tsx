import type { Insight } from './helpers';
import styles from './InsightCard.module.css';

/** Short generated observation about the current time series. */
export function InsightCard({ insight }: { insight: Insight }) {
  const Icon = insight.icon;
  return (
    <div
      className={styles.root}
      data-tone={insight.tone}
    >
      <div className={styles.row}>
        <span className={styles.iconBox}>
          <Icon className={styles.icon} />
        </span>
        <div className={styles.content}>
          <h3 className={styles.title}>{insight.title}</h3>
          <p className={styles.body}>{insight.body}</p>
        </div>
      </div>
    </div>
  );
}
