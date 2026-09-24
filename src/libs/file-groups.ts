import { format, isSameDay, isSameMonth, isSameYear, startOfDay, startOfWeek } from 'date-fns';

/**
 * A run of files under one date heading. The id is stable for a given `now`, so
 * React keys survive a re-render that does not cross a day boundary.
 */
export type FileGroup<TFile> = {
  id: string;
  label: string;
  /** The dates the group covers: one day, or a range. */
  dateLabel: string;
  files: TFile[];
};

/** The coarsest bucket a file can fall into, in the order the groups are shown. */
type Bucket = 'today' | 'yesterday' | 'week' | 'month' | string;

function bucketFor(date: Date, now: Date): { bucket: Bucket; label: string } {
  const today = startOfDay(now);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (isSameDay(date, today)) return { bucket: 'today', label: 'Today' };
  if (isSameDay(date, yesterday)) return { bucket: 'yesterday', label: 'Yesterday' };

  // Monday-start, matching the rest of the app's week.
  if (date >= startOfWeek(today, { weekStartsOn: 1 })) return { bucket: 'week', label: 'Earlier this week' };

  if (isSameMonth(date, today) && isSameYear(date, today)) {
    return { bucket: 'month', label: `Earlier in ${format(today, 'MMMM')}` };
  }

  // Everything older is grouped by its own month, and gains a year once it is
  // ambiguous — "September" alone would mean two different things next year.
  const key = format(date, 'yyyy-MM');
  return { bucket: key, label: isSameYear(date, today) ? format(date, 'MMMM') : format(date, 'MMMM yyyy') };
}

/**
 * The dates a group covers: one day reads as a weekday, a range as its ends.
 * Files arrive already sorted, but not necessarily newest-first, so the range is
 * taken from the extremes rather than the first and last element.
 */
function dateLabelFor(dates: Date[]): string {
  const earliest = dates.reduce((a, b) => (a < b ? a : b));
  const latest = dates.reduce((a, b) => (a > b ? a : b));

  if (isSameDay(earliest, latest)) return format(latest, 'EEE, MMM d');
  if (isSameMonth(earliest, latest)) return `${format(earliest, 'MMM d')} – ${format(latest, 'd')}`;
  return `${format(earliest, 'MMM d')} – ${format(latest, 'MMM d')}`;
}

/**
 * Split files into the date groups Files shows: Today, Yesterday, Earlier this
 * week, Earlier in \<this month\>, then one group per older month.
 *
 * Group order follows the order the files arrive in, so it tracks the chosen
 * sort rather than fighting it — "Oldest first" puts the oldest month at the
 * top without this needing to know which sort is active. A sort that is not by
 * date (Name A–Z, Largest first) still groups correctly; the groups simply
 * appear in the order their first file does.
 */
export function groupFilesByDate<TFile>(
  files: readonly TFile[],
  getDate: (file: TFile) => Date | string,
  now: Date = new Date(),
): FileGroup<TFile>[] {
  const groups = new Map<Bucket, { label: string; files: TFile[]; dates: Date[] }>();

  for (const file of files) {
    const date = new Date(getDate(file));
    const { bucket, label } = bucketFor(date, now);
    const existing = groups.get(bucket);
    if (existing) {
      existing.files.push(file);
      existing.dates.push(date);
    } else {
      groups.set(bucket, { label, files: [file], dates: [date] });
    }
  }

  return [...groups.entries()].map(([id, group]) => ({
    id,
    label: group.label,
    dateLabel: dateLabelFor(group.dates),
    files: group.files,
  }));
}
