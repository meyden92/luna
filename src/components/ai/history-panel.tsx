import { Trash2 } from 'lucide-react';
import * as React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useImageGenerationHistory } from '@/hooks/use-ai-generation-history';
import { CanvasEmpty } from './canvas';
import { promptFromFieldValues, shapeFromFieldValues } from './generation-options';
import styles from './history-panel.module.css';
import { runAge } from './run-list';

interface HistoryPanelProps {
  /** Sends this prompt back to Create, ready to run again. */
  onReuse: (prompt: string) => void;
}

/** Every image this account has generated, newest first. */
function HistoryPanel({ onReuse }: HistoryPanelProps) {
  const { generations, clearCompleted } = useImageGenerationHistory();
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const entries = React.useMemo(
    () =>
      generations
        .filter((item) => item.status === 'succeeded')
        .map((item) => {
          const images = (item.result?.results ?? []).map((result) => result.resultImageUrl).filter((url): url is string => Boolean(url));
          return {
            id: item.id,
            prompt: promptFromFieldValues(item.fieldValues, item.prompt),
            cover: images[0] ?? null,
            count: images.length,
            shape: shapeFromFieldValues(item.fieldValues).value,
            age: runAge(item.createdAt),
          };
        })
        .filter((entry) => entry.cover !== null),
    [generations],
  );

  if (entries.length === 0) {
    return (
      <CanvasEmpty
        title="Nothing generated yet"
        description="Everything you make on Create shows up here, so you can run a good prompt again."
      />
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setConfirmOpen(true)}
        >
          <Trash2 />
          Clear history
        </Button>
      </div>

      <div className={styles.grid}>
        {entries.map((entry) => (
          <article
            key={entry.id}
            className={styles.card}
          >
            <div className={styles.cover}>
              <img
                src={entry.cover ?? undefined}
                alt=""
                loading="lazy"
              />
            </div>
            <div className={styles.body}>
              <p className={styles.prompt}>{entry.prompt}</p>
              <div className={styles.foot}>
                <span>
                  {entry.count} {entry.count === 1 ? 'image' : 'images'} · {entry.shape} · {entry.age}
                </span>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => onReuse(entry.prompt)}
                >
                  Reuse
                </Button>
              </div>
            </div>
          </article>
        ))}
      </div>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear your generation history?</AlertDialogTitle>
            <AlertDialogDescription>
              Finished and failed runs leave this list. The images stay in your files. This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                clearCompleted();
                setConfirmOpen(false);
              }}
            >
              Clear history
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export { HistoryPanel };
