import { Cigarette, Pill } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { NicotineKind } from '@/server/fns/nicotine';
import styles from './EntryDialogs.module.css';
import { formatDateTime, kindLabel, type ParsedEntry } from './helpers';

/** Edit and delete dialogs for a single entry; both are driven by the parent's state. */
export function EntryDialogs({
  editingEntry,
  editKind,
  editNote,
  editOccurredAt,
  onEditKindChange,
  onEditNoteChange,
  onEditOccurredAtChange,
  onCloseEdit,
  onSubmitEdit,
  isUpdating,
  entryToDelete,
  onCloseDelete,
  onConfirmDelete,
  isDeleting,
}: {
  editingEntry: ParsedEntry | null;
  editKind: NicotineKind;
  editNote: string;
  editOccurredAt: string;
  onEditKindChange: (kind: NicotineKind) => void;
  onEditNoteChange: (note: string) => void;
  onEditOccurredAtChange: (value: string) => void;
  onCloseEdit: () => void;
  onSubmitEdit: () => void;
  isUpdating: boolean;
  entryToDelete: ParsedEntry | null;
  onCloseDelete: () => void;
  onConfirmDelete: () => void;
  isDeleting: boolean;
}) {
  return (
    <>
      <Dialog
        open={editingEntry !== null}
        onOpenChange={(open) => {
          if (!open) onCloseEdit();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eintrag bearbeiten</DialogTitle>
            <DialogDescription>
              Typ und Zeitpunkt können korrigiert werden. Notizen werden nur für Rauch-Einträge gespeichert.
            </DialogDescription>
          </DialogHeader>

          <div className={styles.fields}>
            <div className={styles.field}>
              <label
                htmlFor="nicotine-entry-kind"
                className={styles.label}
              >
                Typ
              </label>
              <Select
                value={editKind}
                onValueChange={(value) => onEditKindChange(value as NicotineKind)}
              >
                <SelectTrigger
                  id="nicotine-entry-kind"
                  className={styles.trigger}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="smoking">
                    <Cigarette className={styles.icon} />
                    Rauchen
                  </SelectItem>
                  <SelectItem value="nicorette">
                    <Pill className={styles.icon} />
                    Nicorette
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className={styles.field}>
              <label
                htmlFor="nicotine-entry-time"
                className={styles.label}
              >
                Zeitpunkt
              </label>
              <Input
                id="nicotine-entry-time"
                type="datetime-local"
                value={editOccurredAt}
                onChange={(event) => onEditOccurredAtChange(event.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label
                htmlFor="nicotine-entry-note"
                className={styles.label}
              >
                Notiz
              </label>
              <Textarea
                id="nicotine-entry-note"
                value={editNote}
                onChange={(event) => onEditNoteChange(event.target.value)}
                disabled={editKind === 'nicorette'}
                maxLength={500}
                className={styles.noteInput}
                placeholder={editKind === 'nicorette' ? 'Nicorette speichert nur den Zeitstempel' : 'Optionale Notiz'}
              />
              <div className={styles.counterRow}>
                <span className={styles.counter}>{editNote.length}/500</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onCloseEdit}
              disabled={isUpdating}
            >
              Abbrechen
            </Button>
            <Button
              type="button"
              onClick={onSubmitEdit}
              disabled={isUpdating}
            >
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={entryToDelete !== null}
        onOpenChange={(open) => {
          if (!open) onCloseDelete();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eintrag löschen</DialogTitle>
            <DialogDescription>
              {entryToDelete
                ? `${kindLabel(entryToDelete.kind)} vom ${formatDateTime(entryToDelete.occurredAtDate)} wird dauerhaft entfernt.`
                : 'Dieser Eintrag wird dauerhaft entfernt.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onCloseDelete}
              disabled={isDeleting}
            >
              Abbrechen
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={onConfirmDelete}
              disabled={isDeleting}
            >
              Löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
