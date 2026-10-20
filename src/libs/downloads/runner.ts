import { rmSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Subprocess } from 'bun';
import { formatSize } from '@/libs/utils';
import { sources } from './sources';
import type { Download, DownloadError, Video } from './types';

/** One directory per Download lives under here. */
const TEMP_ROOT = join(tmpdir(), 'lunashare-downloads');
const STDERR_TAIL_LINES = 20;
const CAPTION_SNIPPET_LENGTH = 200;
// Best video plus best audio, preferring H.264/AAC so the merged MP4 plays everywhere.
const FORMAT_ARGS = ['-f', 'bv*+ba/b', '-S', 'vcodec:h264,res,acodec:m4a'];
/** The per-video cap: estimated before preparing, and enforced mid-transfer by `--max-filesize`. */
const MAX_VIDEO_BYTES = 500 * 1024 * 1024;

/** The few fields of yt-dlp's `-J` output the runner reads. */
interface YtDlpFormat {
  filesize?: number | null;
  filesize_approx?: number | null;
}
interface YtDlpInfo extends YtDlpFormat {
  _type?: string;
  entries?: (YtDlpInfo | null)[];
  playlist_index?: number;
  channel?: unknown;
  description?: unknown;
  width?: unknown;
  height?: unknown;
  vcodec?: string | null;
  formats?: unknown[];
  requested_formats?: YtDlpFormat[];
}

interface Job {
  controller: AbortController;
  process?: Subprocess<'ignore', 'pipe', 'pipe'>;
  /** Settles once preparation has stopped, so nothing writes to disk after `discard`. */
  done?: Promise<void>;
}

/** The running preparation of each Download, so `cancel` and `discard` can kill it. */
const jobs = new Map<string, Job>();

/** Where the prepared video `index` of a Download sits on disk. */
export function videoPath(downloadId: string, index: number): string {
  return join(TEMP_ROOT, downloadId, `${index}.mp4`);
}

class YtDlpError extends Error {
  readonly stderr: string;

  constructor(stderr: string) {
    super('yt-dlp failed');
    this.stderr = stderr;
  }
}

function unrecognised(stderr: string): DownloadError {
  return {
    category: 'unrecognised',
    message: 'Preparing this post failed. yt-dlp may be out of date.',
    detail: stderr.trim().split('\n').slice(-STDERR_TAIL_LINES).join('\n'),
  };
}

function captionSnippet(description: unknown): string | undefined {
  if (typeof description !== 'string') return undefined;
  const text = description.replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  return text.length > CAPTION_SNIPPET_LENGTH ? `${text.slice(0, CAPTION_SNIPPET_LENGTH - 1)}…` : text;
}

// Runs yt-dlp for a Download, feeding each stdout line to `onLine`. A non-zero
// exit throws a YtDlpError carrying stderr; aborting the job kills the process.
async function runYtDlp(job: Job, args: string[], onLine?: (line: string) => void): Promise<string> {
  const proc = Bun.spawn(['yt-dlp', ...args], { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', signal: job.controller.signal });
  job.process = proc;

  const stderr = new Response(proc.stderr).text();
  let stdout = '';
  let pending = '';
  const decoder = new TextDecoder();
  for await (const chunk of proc.stdout) {
    const text = decoder.decode(chunk, { stream: true });
    stdout += text;
    if (!onLine) continue;
    const lines = (pending + text).split('\n');
    pending = lines.pop() ?? '';
    for (const line of lines) onLine(line);
  }

  const exitCode = await proc.exited;
  job.process = undefined;
  if (exitCode !== 0) throw new YtDlpError(await stderr);
  return stdout;
}

/**
 * Prepares every video in a Download's post, mutating `download` as it goes:
 * resolve the post with `yt-dlp -J`, then download and merge each video, one at
 * a time, into `<tmp>/lunashare-downloads/<id>/<n>.mp4`. Never rejects; failures
 * land on the Download or the video. yt-dlp only ever sees the Source's
 * extractor and the canonical URL.
 */
export async function prepare(download: Download): Promise<void> {
  const job: Job = { controller: new AbortController() };
  jobs.set(download.id, job);
  job.done = run(download, job).finally(() => jobs.delete(download.id));
  await job.done;
}

/** What the runner keeps per video from the resolve step, beside the public `Video`. */
interface Planned {
  video: Video;
  /** 1-based position in the carousel, for `--playlist-items`; unset for a single-video post. */
  playlistItem?: number;
  /** How many files yt-dlp downloads before merging (video and audio streams are separate). */
  streams: number;
}

// A carousel resolves to a playlist whose photos have no formats (that needs
// `--ignore-no-formats-error`); a single post resolves to one entry.
function videoEntries(info: YtDlpInfo): { entry: YtDlpInfo; playlistItem?: number }[] {
  const entries =
    info._type === 'playlist'
      ? (info.entries ?? []).map((entry, i) => ({ entry, playlistItem: entry?.playlist_index ?? i + 1 }))
      : [{ entry: info }];
  return entries.filter(
    (candidate): candidate is { entry: YtDlpInfo; playlistItem?: number } =>
      !!candidate.entry?.formats?.length && candidate.entry.vcodec !== 'none',
  );
}

/** The size of the formats yt-dlp selected for `entry`, or undefined when any of them has no size. */
function estimateSize(entry: YtDlpInfo): number | undefined {
  let total = 0;
  for (const format of entry.requested_formats ?? [entry]) {
    const size = format.filesize ?? format.filesize_approx;
    if (typeof size !== 'number') return undefined;
    total += size;
  }
  return total;
}

function tooLarge(sizeBytes: number, detail: string): DownloadError {
  const format = (bytes: number) => formatSize(bytes, { precision: 1, trim: true });
  return { category: 'too_large', message: `Too large (${format(sizeBytes)}, limit ${format(MAX_VIDEO_BYTES)})`, detail };
}

async function run(download: Download, job: Job): Promise<void> {
  const { signal } = job.controller;

  try {
    const source = sources.get(download.sourceKey);
    if (!source) throw new Error(`Unknown Source ${download.sourceKey}`);
    const base = ['--use-extractors', source.extractor];

    // Resolve with the same format selection as the download, so width, height
    // and the size estimate describe the formats that will actually be merged.
    const info: YtDlpInfo = JSON.parse(
      await runYtDlp(job, ['-J', '--ignore-no-formats-error', ...base, ...FORMAT_ARGS, download.canonicalUrl]),
    );
    if (signal.aborted) return;

    const account = typeof info.channel === 'string' ? info.channel.replace(/[^A-Za-z0-9._-]/g, '') : '';
    download.account = account || undefined;
    download.caption = captionSnippet(info.description);

    const entries = videoEntries(info);
    if (entries.length === 0) {
      download.status = 'failed';
      download.error = { category: 'no_videos', message: 'No videos in this post', detail: '' };
      return;
    }

    const stem = account ? `${account}_${download.shortcode}` : download.shortcode;
    const planned: Planned[] = entries.map(({ entry, playlistItem }, i) => {
      const index = i + 1;
      const video: Video = {
        index,
        status: 'pending',
        progress: 0,
        filename: entries.length === 1 ? `${stem}.mp4` : `${stem}_${index}.mp4`,
        width: typeof entry.width === 'number' ? entry.width : undefined,
        height: typeof entry.height === 'number' ? entry.height : undefined,
      };
      const estimate = estimateSize(entry);
      if (estimate !== undefined && estimate > MAX_VIDEO_BYTES) {
        video.status = 'failed';
        video.error = tooLarge(estimate, '');
      }
      return { video, playlistItem, streams: entry.requested_formats?.length || 1 };
    });
    download.videos = planned.map(({ video }) => video);

    const dir = join(TEMP_ROOT, download.id);
    await mkdir(dir, { recursive: true });
    for (const item of planned) {
      if (item.video.status !== 'pending') continue;
      download.currentIndex = item.video.index;
      await prepareVideo(download.id, item, base, download.canonicalUrl, job);
      if (signal.aborted) return;
    }
    download.currentIndex = undefined;
    settle(download);
  } catch (error) {
    download.status = 'failed';
    download.currentIndex = undefined;
    download.error = unrecognised(error instanceof YtDlpError ? error.stderr : String(error));
  }
}

// Downloads and merges one video into `<dir>/<n>.mp4`, moving it from
// `preparing` to `ready` or `failed`. `--max-filesize` aborts a stream that turns
// out to be over the cap: yt-dlp then exits 0 without a file and only says so on stdout.
async function prepareVideo(downloadId: string, item: Planned, base: string[], url: string, job: Job): Promise<void> {
  const { video, playlistItem, streams } = item;
  video.status = 'preparing';
  let stream = 0;
  let oversized: { bytes: number; line: string } | undefined;
  try {
    await runYtDlp(
      job,
      [
        ...base,
        ...FORMAT_ARGS,
        ...(playlistItem === undefined ? [] : ['--playlist-items', String(playlistItem)]),
        '--max-filesize',
        String(MAX_VIDEO_BYTES),
        '--merge-output-format',
        'mp4',
        '--newline',
        '--progress-template',
        'download:%(progress._percent_str)s',
        '-o',
        join(TEMP_ROOT, downloadId, `${video.index}.%(ext)s`),
        url,
      ],
      (line) => {
        // yt-dlp reports 0–100 per downloaded file, so each stream gets an equal
        // share of the bar and progress never jumps back when the next one starts.
        if (line.startsWith('[download] Destination:')) stream++;
        const tooBig = line.match(/File is larger than max-filesize \((\d+) bytes/);
        if (tooBig) oversized = { bytes: Number(tooBig[1]), line };
        const percent = Number.parseFloat(line);
        if (line.trim().endsWith('%') && Number.isFinite(percent)) {
          video.progress = Math.min((Math.max(stream - 1, 0) * 100 + percent) / streams, 100);
        }
      },
    );
  } catch (error) {
    if (!(error instanceof YtDlpError)) throw error;
    video.status = 'failed';
    video.error = unrecognised(error.stderr);
    return;
  }

  if (oversized !== undefined) {
    video.status = 'failed';
    video.error = tooLarge(oversized.bytes, oversized.line);
    return;
  }
  const file = Bun.file(videoPath(downloadId, video.index));
  if (!(await file.exists())) {
    video.status = 'failed';
    video.error = unrecognised(`yt-dlp did not produce ${file.name}`);
    return;
  }
  video.status = 'ready';
  video.progress = 100;
  video.sizeBytes = file.size;
}

// Once every video is terminal: ready when any video is, otherwise failed, with
// the videos' shared cause on the Download when they all failed the same way.
export function settle(download: Download): void {
  if (download.videos.some((video) => video.status === 'ready')) {
    download.status = 'ready';
    return;
  }
  download.status = 'failed';
  const [first, ...rest] = download.videos.map((video) => video.error);
  if (first && rest.every((error) => error?.category === first.category)) download.error = first;
}

/** Kills a Download's running yt-dlp, if any, so its `prepare` resolves early. Leaves its files in place. */
export function cancel(downloadId: string): void {
  jobs.get(downloadId)?.controller.abort();
}

/** Kills a Download's running yt-dlp, if any, and deletes its directory. */
export async function discard(downloadId: string): Promise<void> {
  const job = jobs.get(downloadId);
  if (job) {
    job.controller.abort();
    await job.done;
  }
  await rm(join(TEMP_ROOT, downloadId), { recursive: true, force: true });
}

/** Deletes every Download's directory. Called once at boot, before any Download can exist. */
export function sweepDownloadTemp(): void {
  rmSync(TEMP_ROOT, { recursive: true, force: true });
}
