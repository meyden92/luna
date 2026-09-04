import { Cigarette, Edit3, Pill, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/libs/utils';
import styles from './EntriesTable.module.css';
import { formatDateTime, formatMinutes, kindLabel, type ParsedEntry } from './helpers';

/** Recent entries with the two gap columns and the per-row edit / delete actions. */
export function EntriesTable({
  entries,
  entryGapById,
  smokingGapById,
  onEdit,
  onDelete,
}: {
  entries: ParsedEntry[];
  entryGapById: Map<string, number>;
  smokingGapById: Map<string, number>;
  onEdit: (entry: ParsedEntry) => void;
  onDelete: (entry: ParsedEntry) => void;
}) {
  if (entries.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>Noch keine Einträge vorhanden</p>
        <p className={styles.emptyBody}>Der Verlauf füllt sich automatisch nach der ersten Erfassung.</p>
      </div>
    );
  }

  return (
    <div className={styles.tableWrap}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Zeit</TableHead>
            <TableHead>Typ</TableHead>
            <TableHead>Notiz</TableHead>
            <TableHead className={styles.right}>Seit letztem Eintrag</TableHead>
            <TableHead className={styles.right}>Seit letzter Zigarette</TableHead>
            <TableHead className={styles.right}>Aktionen</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => {
            const entryGap = entryGapById.get(entry.id) ?? null;
            const smokeGap = entry.kind === 'smoking' ? (smokingGapById.get(entry.id) ?? null) : null;
            return (
              <TableRow key={entry.id}>
                <TableCell className={styles.timeCell}>{formatDateTime(entry.occurredAtDate)}</TableCell>
                <TableCell>
                  <Badge variant={entry.kind === 'smoking' ? 'destructive' : 'default'}>
                    {entry.kind === 'smoking' ? <Cigarette className={styles.badgeIcon} /> : <Pill className={styles.badgeIcon} />}
                    {kindLabel(entry.kind)}
                  </Badge>
                </TableCell>
                <TableCell className={styles.noteCell}>{entry.note || '-'}</TableCell>
                <TableCell className={styles.gapCell}>{formatMinutes(entryGap)}</TableCell>
                <TableCell className={styles.gapCell}>{formatMinutes(smokeGap)}</TableCell>
                <TableCell className={styles.right}>
                  <div className={styles.actions}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Eintrag bearbeiten"
                      onClick={() => onEdit(entry)}
                    >
                      <Edit3 className={styles.actionIcon} />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Eintrag löschen"
                      onClick={() => onDelete(entry)}
                    >
                      <Trash2 className={cn(styles.actionIcon, styles.deleteIcon)} />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
