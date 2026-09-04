import { CheckCircle2, Circle, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatApproxDuration, type RecoveryMilestoneView } from './helpers';
import styles from './RecoveryPanel.module.css';

/** Progress summary plus the full list of recovery milestones since the last cigarette. */
export function RecoveryPanel({
  milestones,
  reachedCount,
  progress,
  nextMilestone,
  currentSmokeFreeMinutes,
}: {
  milestones: RecoveryMilestoneView[];
  reachedCount: number;
  progress: number;
  nextMilestone: RecoveryMilestoneView | null;
  currentSmokeFreeMinutes: number | null;
}) {
  return (
    <div className={styles.root}>
      <div className={styles.summary}>
        <div className={styles.summaryHeader}>
          <div>
            <p className={styles.label}>Erreicht</p>
            <div className={styles.count}>
              {reachedCount}/{milestones.length}
            </div>
            <p className={styles.caption}>wissenschaftliche Rauchstopp-Meilensteine</p>
          </div>
          <span className={styles.shield}>
            <ShieldCheck className={styles.shieldIcon} />
          </span>
        </div>

        <div className={styles.progressTrack}>
          <div
            className={styles.progressFill}
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className={styles.next}>
          {nextMilestone ? (
            <>
              <p className={styles.label}>Nächster Meilenstein</p>
              <h3 className={styles.nextTitle}>{nextMilestone.title}</h3>
              <p className={styles.nextBody}>
                {currentSmokeFreeMinutes === null
                  ? 'Startet mit dem ersten Rauch-Eintrag.'
                  : `Noch ca. ${formatApproxDuration(nextMilestone.remainingMinutes)} bis ${nextMilestone.label}.`}
              </p>
            </>
          ) : (
            <>
              <p className={styles.label}>Langfristig erreicht</p>
              <h3 className={styles.nextTitle}>Alle Meilensteine markiert</h3>
              <p className={styles.nextBody}>Der Fokus liegt jetzt auf Stabilität und Rückfallprävention.</p>
            </>
          )}
        </div>

        <p className={styles.disclaimer}>
          Richtwerte aus medizinischen Übersichten. Individuelle Erholung hängt von Vorgeschichte, Konsum und Begleiterkrankungen ab.
        </p>
      </div>

      <div className={styles.milestones}>
        {milestones.map((milestone) => (
          <div
            key={milestone.label}
            className={styles.milestone}
            data-reached={milestone.reached ? '' : undefined}
          >
            <div className={styles.milestoneRow}>
              <span className={styles.marker}>
                {milestone.reached ? <CheckCircle2 className={styles.markerIcon} /> : <Circle className={styles.markerIcon} />}
              </span>
              <div className={styles.milestoneContent}>
                <div className={styles.milestoneBadges}>
                  <Badge variant="outline">{milestone.label}</Badge>
                  {milestone.reached ? (
                    <Badge>erreicht</Badge>
                  ) : currentSmokeFreeMinutes === null ? null : (
                    <span className={styles.remaining}>noch ca. {formatApproxDuration(milestone.remainingMinutes)}</span>
                  )}
                </div>
                <h3 className={styles.milestoneTitle}>{milestone.title}</h3>
                <p className={styles.milestoneBody}>{milestone.body}</p>
                <p className={styles.source}>Quelle: {milestone.source}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
