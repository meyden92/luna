/**
 * The gallery user's seeded dataset, as data. `gallery.setup.ts` seeds exactly
 * this; specs assert against it instead of hard-coded counts, titles or dates.
 *
 * Two halves:
 * - `GALLERY_UPLOADS` is fixed: what is uploaded, under which title, into which
 *   folder, public or private.
 * - `dateAnchors(now)` and `galleryDataset(seededAt)` add when each file was
 *   "created". Setup backdates `file.created_at` to these and records the
 *   moment it used in `.auth/gallery-seed.json`; `seededGallery()` (the
 *   `gallery` fixture) rebuilds the same dataset from that moment.
 *
 * Everything is UTC, like the stack and the test browser. A run that crosses
 * midnight UTC shifts the app's date groups away from these; nothing else does.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CORPUS, type CorpusEntry } from './corpus';

export const GALLERY_FOLDERS = ['Travel', 'Work', 'Archive'] as const;
export type GalleryFolder = (typeof GALLERY_FOLDERS)[number];

/** More than four pages of 30, so paging and Preview stepping cross page boundaries. */
export const GALLERY_SIZE = 125;

export interface GalleryUpload {
  /** Unique. The corpus name for the first copy, then `<stem> (<n>)<ext>`. */
  title: string;
  /** The corpus file whose bytes were uploaded; `source.size` is the stored size. */
  source: CorpusEntry;
  /** `null` is the "Not in a folder" Scope. */
  folder: GalleryFolder | null;
  private: boolean;
}

function copyTitle(name: string, copy: number): string {
  if (copy === 1) return name;
  const dot = name.lastIndexOf('.');
  return dot > 0 ? `${name.slice(0, dot)} (${copy})${name.slice(dot)}` : `${name} (${copy})`;
}

// Folders by position mod 7 (3 of 7 in no folder, 2 in Travel, 1 each in Work
// and Archive) and privacy by position mod 5 cross over, so every Scope holds
// public and private files of several kinds.
const FOLDER_PATTERN: (GalleryFolder | null)[] = [null, null, null, 'Travel', 'Travel', 'Work', 'Archive'];

/** The whole corpus, then copies of it, to `GALLERY_SIZE` files. */
export const GALLERY_UPLOADS: readonly GalleryUpload[] = Array.from({ length: GALLERY_SIZE }, (_, i) => {
  const source = CORPUS[i % CORPUS.length]!;
  return {
    title: copyTitle(source.name, Math.floor(i / CORPUS.length) + 1),
    source,
    folder: FOLDER_PATTERN[i % FOLDER_PATTERN.length]!,
    private: i % 5 === 2,
  };
});

/** A calendar point files are backdated to, and the Files-screen date group it lands in. */
export interface DateAnchor {
  at: Date;
  /** The `<h2>` the Files screen shows for it, e.g. "Yesterday" or "June 2025". */
  group: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const monthName = (date: Date) => date.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
const utc = (year: number, month: number, day: number, hour = 0) => new Date(Date.UTC(year, month, day, hour));

/**
 * The anchors for a given moment, newest first, each in a different date group:
 * - today, halfway between midnight and `now`;
 * - yesterday at 12:00;
 * - Monday of this week at 12:00, only from Wednesday on (before that, Monday
 *   is today or yesterday, so "Earlier this week" cannot exist);
 * - the 2nd of this month at 12:00, only when that is before both this week
 *   and yesterday ("Earlier in <month>");
 * - the 15th of each of the three previous months at 12:00;
 * - June 15 of last year at 12:00 (its group carries the year).
 */
export function dateAnchors(now: Date): DateAnchor[] {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const todayStart = utc(year, month, now.getUTCDate());
  const yesterdayStart = new Date(todayStart.getTime() - DAY_MS);
  const daysSinceMonday = (now.getUTCDay() + 6) % 7;
  const weekStart = new Date(todayStart.getTime() - daysSinceMonday * DAY_MS);
  const monthGroup = (date: Date) => (date.getUTCFullYear() === year ? monthName(date) : `${monthName(date)} ${date.getUTCFullYear()}`);

  const anchors: DateAnchor[] = [
    { at: new Date((todayStart.getTime() + now.getTime()) / 2), group: 'Today' },
    { at: new Date(yesterdayStart.getTime() + 12 * 60 * 60 * 1000), group: 'Yesterday' },
  ];
  if (daysSinceMonday >= 2) {
    anchors.push({ at: new Date(weekStart.getTime() + 12 * 60 * 60 * 1000), group: 'Earlier this week' });
  }
  const second = utc(year, month, 2, 12);
  if (second < weekStart && second < yesterdayStart) {
    anchors.push({ at: second, group: `Earlier in ${monthName(now)}` });
  }
  for (const back of [1, 2, 3]) {
    const at = utc(year, month - back, 15, 12);
    anchors.push({ at, group: monthGroup(at) });
  }
  const lastYear = utc(year - 1, 5, 15, 12);
  anchors.push({ at: lastYear, group: monthGroup(lastYear) });
  return anchors;
}

export interface GalleryFile extends GalleryUpload {
  createdAt: Date;
  /** The date group heading the file is listed under. */
  group: string;
}

export interface GalleryDataset {
  /** The moment the anchors were computed from. */
  seededAt: Date;
  /** In `GALLERY_UPLOADS` order. Every `createdAt` is distinct. */
  files: GalleryFile[];
  /** Date groups newest first, as "Newest first" shows them, each with its files newest first. */
  groups: { label: string; files: GalleryFile[] }[];
  /** Sum of the stored sizes. */
  totalBytes: number;
}

/**
 * The dataset seeded at `seededAt`. Files go round-robin over the anchors, the
 * k-th round k seconds before its anchor, so no two files share a `createdAt`
 * and "Newest first" / "Oldest first" have exactly one right order.
 */
export function galleryDataset(seededAt: Date): GalleryDataset {
  const anchors = dateAnchors(seededAt);
  const files = GALLERY_UPLOADS.map((upload, i): GalleryFile => {
    const anchor = anchors[i % anchors.length]!;
    const round = Math.floor(i / anchors.length);
    return { ...upload, createdAt: new Date(anchor.at.getTime() - round * 1000), group: anchor.group };
  });
  const newestFirst = (a: GalleryFile, b: GalleryFile) => b.createdAt.getTime() - a.createdAt.getTime();
  return {
    seededAt,
    files,
    groups: anchors.map((anchor) => ({ label: anchor.group, files: files.filter((f) => f.group === anchor.group).sort(newestFirst) })),
    totalBytes: files.reduce((sum, f) => sum + f.source.size, 0),
  };
}

/**
 * Whether the Files search box finds the file for `term`. Search is a
 * case-insensitive substring match on the title or the tags, and ShareX tags
 * every upload `sharex-upload,<title up to its first "-">`, so a term inside
 * "sharex-upload" matches every file.
 */
export function matchesSearch(file: GalleryUpload, term: string): boolean {
  const needle = term.toLowerCase();
  return file.title.toLowerCase().includes(needle) || 'sharex-upload'.includes(needle);
}

/** Where `gallery.setup.ts` records the moment it seeded at. Gitignored. */
export const GALLERY_SEED_PATH = resolve(import.meta.dirname, '../.auth/gallery-seed.json');

/** The dataset as this run's setup seeded it. */
export function seededGallery(): GalleryDataset {
  const { seededAt } = JSON.parse(readFileSync(GALLERY_SEED_PATH, 'utf8')) as { seededAt: string };
  return galleryDataset(new Date(seededAt));
}
