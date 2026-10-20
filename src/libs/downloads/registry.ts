import { cancel, discard, prepare, settle } from './runner';
import type { Download, DownloadError, DownloadStatus, ParsedPost } from './types';

/** How long a ready or failed Download keeps its files before it expires. */
export const EXPIRY_MS = 60 * 60 * 1000;
/** How long a Download may prepare before its process is killed and its unfinished videos fail. */
export const PREPARATION_TIMEOUT_MS = 10 * 60 * 1000;
/** How many of a User's Downloads prepare at once; the rest wait as `queued`. */
export const MAX_PREPARING_PER_USER = 2;

/** Statuses for which pasting the same post leads to the existing Download instead of a new one. */
const LIVE_STATUSES: readonly DownloadStatus[] = ['queued', 'preparing', 'ready'];

// Every Download, in memory only: a restart drops them all, by design.
// Every lookup is scoped to the owning User.
const downloads = new Map<string, Download>();
/** The pending timeout or expiry timer of each Download, cleared on removal. */
const timers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Starts a Download for `post`, queued until the User has a free preparation
 * slot. When the User already has a queued, preparing or ready Download of the
 * same post, returns that one instead, with `existing` set.
 */
export function start(userId: string, post: ParsedPost): { download: Download; existing: boolean } {
  const existing = listFor(userId).find(
    (download) => download.canonicalUrl === post.canonicalUrl && LIVE_STATUSES.includes(download.status),
  );
  if (existing) return { download: existing, existing: true };

  const download: Download = {
    id: crypto.randomUUID(),
    userId,
    sourceKey: post.sourceKey,
    canonicalUrl: post.canonicalUrl,
    shortcode: post.shortcode,
    status: 'queued',
    videos: [],
    createdAt: new Date(),
  };
  downloads.set(download.id, download);
  startQueued(userId);
  return { download, existing: false };
}

/** The User's Downloads, newest first. */
export function listFor(userId: string): Download[] {
  return [...downloads.values()]
    .filter((download) => download.userId === userId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function get(userId: string, id: string): Download | undefined {
  const download = downloads.get(id);
  return download?.userId === userId ? download : undefined;
}

/** Stops the Download's preparation, deletes its files and drops it. False when the User has no such Download. */
export async function remove(userId: string, id: string): Promise<boolean> {
  if (!get(userId, id)) return false;
  downloads.delete(id);
  clearTimeout(timers.get(id));
  timers.delete(id);
  startQueued(userId);
  await discard(id);
  return true;
}

// Moves the User's oldest queued Downloads to `preparing` while they have free slots.
function startQueued(userId: string): void {
  const own = listFor(userId);
  let free = MAX_PREPARING_PER_USER - own.filter((download) => download.status === 'preparing').length;
  const queued = own.filter((download) => download.status === 'queued').reverse();
  for (const download of queued.slice(0, Math.max(free, 0))) {
    begin(download);
    free--;
  }
}

// Prepares a Download under the preparation timeout. Once preparation stops,
// schedules its expiry and frees its slot for the next queued Download.
function begin(download: Download): void {
  download.status = 'preparing';
  let timedOut = false;
  timers.set(
    download.id,
    setTimeout(() => {
      timedOut = true;
      cancel(download.id);
    }, PREPARATION_TIMEOUT_MS),
  );

  void prepare(download).then(() => {
    // Removed meanwhile: `remove` already cleared the timer and started the next one.
    if (downloads.get(download.id) !== download) return;
    clearTimeout(timers.get(download.id));
    if (timedOut) failUnfinished(download);
    scheduleExpiry(download);
    startQueued(download.userId);
  });
}

// After a timeout: the killed video and every video still pending fail, and the
// Download settles by the usual rules, or fails outright when the post was never
// resolved. Videos that failed earlier keep their own error. The timeout replaces
// whatever the killed run was categorised as, but keeps its output as the detail.
function failUnfinished(download: Download): void {
  const timedOut = (previous?: DownloadError): DownloadError => ({
    category: 'unrecognised',
    message: 'Timed out after 10 minutes',
    detail: previous?.detail ?? '',
  });
  const killed = download.currentIndex;
  download.currentIndex = undefined;
  if (download.videos.length === 0) {
    download.status = 'failed';
    download.error = timedOut(download.error);
    return;
  }
  for (const video of download.videos) {
    if (video.status === 'ready' || (video.status === 'failed' && video.index !== killed)) continue;
    video.status = 'failed';
    video.error = timedOut(video.error);
  }
  download.error = undefined;
  settle(download);
}

// A ready or failed Download expires `EXPIRY_MS` later: its files are deleted,
// but it stays listed as `expired` until removed or until a restart.
function scheduleExpiry(download: Download): void {
  download.readyAt = new Date();
  download.expiresAt = new Date(download.readyAt.getTime() + EXPIRY_MS);
  timers.set(
    download.id,
    setTimeout(() => {
      timers.delete(download.id);
      download.status = 'expired';
      void discard(download.id);
    }, EXPIRY_MS),
  );
}
