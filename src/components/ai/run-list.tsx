import { formatDistanceToNowStrict } from 'date-fns';
import { RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResultTile } from './result-tile';
import styles from './run-list.module.css';
import type { ResultActions } from './use-result-actions';

export interface RunResult {
  /** The finished image, or null while the run is still working on it. */
  src: string | null;
  /** The stored file it became; absent when the run failed to store it. */
  fileId?: string;
  error?: string;
}

/**
 * One press of Generate, as the canvas shows it. Every tab normalises its own
 * queue items into this shape so the canvas stays the same on all of them.
 */
export interface GenerationRun {
  id: string;
  prompt: string;
  /** Leading half of the metadata line, e.g. "z-image · 1:1 · Balanced". */
  meta: string;
  createdAt: number;
  loading: boolean;
  /** width / height, driving both the tiles and how many fit per row. */
  ratio: number;
  results: RunResult[];
  /** Reference thumbnails shown before the prompt on Edit and Templates. */
  references?: string[];
}

interface RunListProps {
  runs: GenerationRun[];
  actions: ResultActions;
  onUseInEdit: (src: string) => void;
  /** Puts this run's prompt back in the prompt card. */
  onReuse?: (run: GenerationRun) => void;
  /** Runs the same request again, unchanged. */
  onRetry?: (run: GenerationRun) => void;
  /**
   * False where the stream does not report the stored file's id yet (templates),
   * so a result without one is not presented as having failed to save.
   */
  fileIdsReported?: boolean;
}

/** "Just now" until the first minute is up, then a relative age. */
function runAge(createdAt: number) {
  const elapsed = Date.now() - createdAt;
  return elapsed < 60_000 ? 'Just now' : `${formatDistanceToNowStrict(createdAt)} ago`;
}

/** Wide shapes get two per row; everything else four. */
function columnsFor(run: GenerationRun) {
  return Math.min(Math.max(run.results.length, 1), run.ratio > 1.4 ? 2 : 4);
}

/** The canvas body: every run of this tab, newest first. */
function RunList({ runs, actions, onUseInEdit, onReuse, onRetry, fileIdsReported = true }: RunListProps) {
  return runs.map((run) => (
    <section
      key={run.id}
      className={styles.run}
    >
      <div className={styles.head}>
        {run.references && run.references.length > 0 && (
          <div className={styles.thumbs}>
            {run.references.map((src) => (
              <img
                key={src}
                src={src}
                alt=""
              />
            ))}
          </div>
        )}
        <div className={styles.headText}>
          <p className={styles.prompt}>{run.prompt}</p>
          <p className={styles.meta}>
            {run.meta} · {run.loading ? <span className={styles.working}>Generating…</span> : runAge(run.createdAt)}
          </p>
        </div>
        {!run.loading && onRetry && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRetry(run)}
          >
            <RefreshCw />
            Retry
          </Button>
        )}
        {!run.loading && onReuse && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onReuse(run)}
          >
            <RotateCcw />
            Reuse prompt
          </Button>
        )}
      </div>
      <div
        className={styles.grid}
        // Runtime value: how many tiles this run's shape allows per row.
        style={{ gridTemplateColumns: `repeat(${columnsFor(run)}, minmax(0, 1fr))` }}
      >
        {run.results.map((result, index) => (
          <ResultTile
            key={result.src ?? `pending-${index}`}
            src={result.src}
            fileId={result.fileId}
            fileIdReported={fileIdsReported}
            error={result.error}
            ratio={run.ratio}
            index={index}
            onUseInEdit={onUseInEdit}
            onCopy={actions.onCopy}
            onSaveToFolder={actions.onSaveToFolder}
            onDownload={actions.onDownload}
          />
        ))}
      </div>
    </section>
  ));
}

export { RunList, runAge };
