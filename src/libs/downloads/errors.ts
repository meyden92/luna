import type { ErrorPattern } from './sources';
import type { DownloadError, ErrorCategory } from './types';

const STDERR_TAIL_LINES = 20;

/** The message shown for each error category. `too_large` builds its own, with the size and the limit. */
export const ERROR_MESSAGES: Record<Exclude<ErrorCategory, 'too_large'>, string> = {
  needs_login: 'This post needs an Instagram login.',
  not_found: 'Post not found or private.',
  no_videos: 'No videos in this post.',
  rate_limited: 'Instagram is rate-limiting requests. Try again later, or set or refresh the Source session.',
  unrecognised: "yt-dlp couldn't handle this post. It may be out of date: run the 'Update yt-dlp' task.",
};

/** The last lines of yt-dlp's output, as a DownloadError's `detail`. */
export function stderrTail(stderr: string): string {
  return stderr.trim().split('\n').slice(-STDERR_TAIL_LINES).join('\n');
}

/** A DownloadError of `category` with that category's message. */
export function downloadError(category: Exclude<ErrorCategory, 'too_large'>, detail: string): DownloadError {
  return { category, message: ERROR_MESSAGES[category], detail };
}

/**
 * Maps a failed yt-dlp run to the first of the Source's `patterns` that matches
 * one of its `ERROR:` lines (warnings never decide the category), or to
 * `unrecognised` when none does. `sessionUsed` says whether the run had a Source
 * session, which a `needs_login` message then names.
 */
export function categorise(stderr: string, patterns: readonly ErrorPattern[], sessionUsed: boolean): DownloadError {
  const errors = stderr
    .split('\n')
    .filter((line) => line.startsWith('ERROR:'))
    .join('\n');
  const match = patterns.find(({ pattern }) => pattern.test(errors));
  const error = downloadError(match?.category ?? 'unrecognised', stderrTail(stderr));
  if (error.category === 'needs_login') {
    error.message += sessionUsed ? ' A Source session is set; it may have expired.' : ' No Source session is set.';
  }
  return error;
}
