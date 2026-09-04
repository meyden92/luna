import { NotebookPen, Pill, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import styles from './QuickLogPanel.module.css';

/** Note field plus the two one-tap logging buttons; the timestamp is set on save. */
export function QuickLogPanel({
  note,
  onNoteChange,
  onLogSmoking,
  onLogNicorette,
  isPending,
}: {
  note: string;
  onNoteChange: (note: string) => void;
  onLogSmoking: () => void;
  onLogNicorette: () => void;
  isPending: boolean;
}) {
  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Jetzt erfassen</h2>
          <p className={styles.description}>Zeitstempel wird beim Speichern gesetzt.</p>
        </div>
        <NotebookPen className={styles.headerIcon} />
      </div>

      <div className={styles.body}>
        <Textarea
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
          placeholder="Optionale Notiz zum Rauch-Eintrag"
          maxLength={500}
          className={styles.noteInput}
        />
        <div className={styles.meta}>
          <span>{note.trim().length > 0 ? 'Notiz wird nur bei Rauchen gespeichert' : 'Nicorette wird ohne Notiz gespeichert'}</span>
          <span className={styles.counter}>{note.length}/500</span>
        </div>
        <div className={styles.actions}>
          <Button
            type="button"
            size="lg"
            variant="destructive"
            onClick={onLogSmoking}
            disabled={isPending}
            className={styles.action}
          >
            <Plus />
            Rauchen
          </Button>
          <Button
            type="button"
            size="lg"
            onClick={onLogNicorette}
            disabled={isPending}
            className={styles.action}
          >
            <Pill />
            Nicorette
          </Button>
        </div>
      </div>
    </div>
  );
}
