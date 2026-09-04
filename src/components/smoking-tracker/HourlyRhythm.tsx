import styles from './HourlyRhythm.module.css';
import type { HourDatum } from './helpers';

/** Bar per hour of day; the tallest bar corresponds to the busiest hour in the period. */
export function HourlyRhythm({ hourlyData }: { hourlyData: HourDatum[] }) {
  const maxHourlyTotal = Math.max(...hourlyData.map((hour) => hour.smoking + hour.nicorette), 1);

  return (
    <div className={styles.root}>
      {hourlyData.map((hour) => {
        const total = hour.smoking + hour.nicorette;
        const height = total === 0 ? 10 : 14 + Math.round((total / maxHourlyTotal) * 70);
        return (
          <div
            key={hour.hour}
            className={styles.column}
          >
            <div className={styles.track}>
              <div
                className={styles.bar}
                style={{ height }}
                title={`${String(hour.hour).padStart(2, '0')}:00 - ${hour.smoking} Rauchen, ${hour.nicorette} Nicorette`}
              />
            </div>
            <span className={styles.hour}>{String(hour.hour).padStart(2, '0')}</span>
          </div>
        );
      })}
    </div>
  );
}
