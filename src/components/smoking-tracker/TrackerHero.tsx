import { Cigarette, TimerReset } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatDateTime, formatLiveDuration, kindLabel, type ParsedEntry } from './helpers';
import styles from './TrackerHero.module.css';

/** Headline panel with the two live counters that tick once per second. */
export function TrackerHero({
  lastEntry,
  lastSmoking,
  currentSmokeFreeMs,
  currentEntryMs,
}: {
  lastEntry: ParsedEntry | null;
  lastSmoking: ParsedEntry | null;
  currentSmokeFreeMs: number | null;
  currentEntryMs: number | null;
}) {
  return (
    <section className={styles.root}>
      <div className={styles.glow} />
      <div className={styles.content}>
        <div className={styles.intro}>
          <Badge
            variant="outline"
            className="margin-bottom-4"
          >
            Privates Rauchprotokoll
          </Badge>
          <h1 className={styles.title}>Rauchfrei-Rhythmus</h1>
          <p className={styles.subtitle}>
            {lastEntry
              ? `Letzter Eintrag: ${kindLabel(lastEntry.kind)} am ${formatDateTime(lastEntry.occurredAtDate)}.`
              : 'Noch keine Einträge vorhanden.'}
          </p>
        </div>

        <div className={styles.timers}>
          <div
            className={styles.timer}
            data-tone="danger"
          >
            <div className={styles.timerHeader}>
              <span className={styles.timerLabel}>Seit letzter Zigarette</span>
              <Cigarette className={styles.timerIcon} />
            </div>
            <div className={styles.timerValue}>{formatLiveDuration(currentSmokeFreeMs)}</div>
            <p className={styles.timerMeta}>
              {lastSmoking ? formatDateTime(lastSmoking.occurredAtDate) : 'Wartet auf den ersten Rauch-Eintrag'}
            </p>
          </div>

          <div
            className={styles.timer}
            data-tone="success"
          >
            <div className={styles.timerHeader}>
              <span className={styles.timerLabel}>Seit letztem Eintrag</span>
              <TimerReset className={styles.timerIcon} />
            </div>
            <div className={styles.timerValue}>{formatLiveDuration(currentEntryMs)}</div>
            <p className={styles.timerMeta}>
              {lastEntry ? `${kindLabel(lastEntry.kind)} wurde zuletzt erfasst` : 'Bereit für den ersten Eintrag'}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
