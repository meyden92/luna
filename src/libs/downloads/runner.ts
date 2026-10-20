import { rmSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Subprocess } from 'bun';
import { getSourceSession } from '@/db/queries/source-sessions';
import { decryptFieldValue } from '@/libs/encryption/field-encryption';
import { formatSize } from '@/libs/utils';
import { categorise, downloadError, stderrTail } from './errors';
import { type Source, sources } from './sources';
import type { Download, DownloadError, Video } from './types';

/** One directory per Download lives under here. */
const TEMP_ROOT = join(tmpdir(), 'lunashare-downloads');
const CAPTION_SNIPPET_LENGTH = 200;
// Best video plus best audio. The highest resolution wins; H.264/AAC only breaks
// ties, so a 1080p VP9 stream beats a 720p H.264 one. QuickTime and iOS can't
// play VP9 in MP4, so `transcode` re-encodes any video that isn't H.264 afterwards.
const FORMAT_ARGS = ['-f', 'bv*+ba/b', '-S', 'res,vcodec:h264,acodec:aac'];
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

/** A yt-dlp, ffprobe or ffmpeg run that exited non-zero, including one the job's abort killed. */
class ProcessError extends Error {
  readonly stderr: string;

  constructor(stderr: string) {
    super('Process exited non-zero');
    this.stderr = stderr;
  }
}

function captionSnippet(description: unknown): string | undefined {
  if (typeof description !== 'string') return undefined;
  const text = description.replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  return text.length > CAPTION_SNIPPET_LENGTH ? `${text.slice(0, CAPTION_SNIPPET_LENGTH - 1)}…` : text;
}

// Runs `command` (yt-dlp, ffprobe or ffmpeg) for a Download, feeding each stdout
// line to `onLine`, and returns its output. A non-zero exit throws a ProcessError
// carrying stderr; aborting the job kills the process.
async function runProcess(job: Job, command: string[], onLine?: (line: string) => void): Promise<{ stdout: string; stderr: string }> {
  const proc = Bun.spawn(command, { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', signal: job.controller.signal });
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
  if (exitCode !== 0) throw new ProcessError(await stderr);
  return { stdout, stderr: await stderr };
}

/**
 * Prepares every video in a Download's post, mutating `download` as it goes:
 * resolve the post with `yt-dlp -J`, then download and merge each video, one at
 * a time, into `<tmp>/lunashare-downloads/<id>/<n>.mp4`. Never rejects; failures
 * land on the Download or the video. yt-dlp only ever sees the Source's
 * extractor and the canonical URL, plus the Source session's cookies when one is
 * set, written beside the videos so they go with the Download's directory.
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
  /** Whether the resolved video codec isn't H.264, so the transcode gets a share of the progress bar. */
  transcode: boolean;
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

// Writes the Source's Source session, if one is set, to `<dir>/cookies.txt`,
// readable only by this process's user. Loaded per Download, so a replaced
// session applies to the next Download without a restart. Returns the
// `--cookies` arguments for yt-dlp, empty without a session.
async function writeCookies(dir: string, sourceKey: string): Promise<string[]> {
  const session = await getSourceSession(sourceKey);
  if (!session) return [];
  const path = join(dir, 'cookies.txt');
  await writeFile(path, decryptFieldValue(session.encryptedValue), { mode: 0o600 });
  return ['--cookies', path];
}

async function run(download: Download, job: Job): Promise<void> {
  const { signal } = job.controller;
  const source = sources.get(download.sourceKey);

  try {
    if (!source) throw new Error(`Unknown Source ${download.sourceKey}`);

    const dir = join(TEMP_ROOT, download.id);
    await mkdir(dir, { recursive: true });
    const cookieArgs = await writeCookies(dir, source.key);
    download.sessionUsed = cookieArgs.length > 0;
    if (signal.aborted) return;

    // Resolve with the same arguments as the download, so width, height and the
    // size estimate describe the formats that will actually be merged.
    const baseArgs = ['--use-extractors', source.extractor, ...cookieArgs, ...FORMAT_ARGS];
    const resolved = await runProcess(job, ['yt-dlp', '-J', '--ignore-no-formats-error', ...baseArgs, download.canonicalUrl]);
    const info: YtDlpInfo = JSON.parse(resolved.stdout);
    if (signal.aborted) return;

    const account = typeof info.channel === 'string' ? info.channel.replace(/[^A-Za-z0-9._-]/g, '') : '';
    download.account = account || undefined;
    download.caption = captionSnippet(info.description);

    const entries = videoEntries(info);
    if (entries.length === 0) {
      download.status = 'failed';
      // yt-dlp prints "No video formats found!" for each photo.
      download.error = downloadError('no_videos', stderrTail(resolved.stderr));
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
      return { video, playlistItem, streams: entry.requested_formats?.length || 1, transcode: !isH264(entry.vcodec) };
    });
    download.videos = planned.map(({ video }) => video);

    for (const item of planned) {
      if (item.video.status !== 'pending') continue;
      download.currentIndex = item.video.index;
      await prepareVideo(download, item, source, baseArgs, job);
      if (signal.aborted) return;
    }
    download.currentIndex = undefined;
    settle(download);
  } catch (error) {
    download.status = 'failed';
    download.currentIndex = undefined;
    download.error =
      error instanceof ProcessError && source
        ? categorise(error.stderr, source.errorPatterns, download.sessionUsed ?? false)
        : downloadError('unrecognised', stderrTail(String(error)));
  }
}

// Downloads and merges one video of `download` into `<dir>/<n>.mp4`, transcoding
// it to H.264 when it isn't already, and moves it from `preparing` to `ready` or
// `failed`. `baseArgs` are the resolve step's extractor, cookie and format
// arguments. `--max-filesize` aborts a stream that turns out to be over the cap:
// yt-dlp then exits 0 without a file and only says so on stdout.
async function prepareVideo(download: Download, item: Planned, source: Source, baseArgs: string[], job: Job): Promise<void> {
  const { video, playlistItem, streams } = item;
  video.status = 'preparing';
  // Each downloaded stream and the transcode, when one is expected, get an equal
  // share of the bar, so progress never jumps back when the next one starts.
  const shares = streams + (item.transcode ? 1 : 0);
  let stream = 0;
  let oversized: { bytes: number; line: string } | undefined;
  try {
    await runProcess(
      job,
      [
        'yt-dlp',
        ...baseArgs,
        ...(playlistItem === undefined ? [] : ['--playlist-items', String(playlistItem)]),
        '--max-filesize',
        String(MAX_VIDEO_BYTES),
        '--merge-output-format',
        'mp4',
        '--newline',
        '--progress-template',
        'download:%(progress._percent_str)s',
        '-o',
        join(TEMP_ROOT, download.id, `${video.index}.%(ext)s`),
        download.canonicalUrl,
      ],
      (line) => {
        // yt-dlp reports 0–100 per downloaded file.
        if (line.startsWith('[download] Destination:')) stream++;
        const tooBig = line.match(/File is larger than max-filesize \((\d+) bytes/);
        if (tooBig) oversized = { bytes: Number(tooBig[1]), line };
        const percent = Number.parseFloat(line);
        if (line.trim().endsWith('%') && Number.isFinite(percent)) {
          video.progress = Math.min((Math.max(stream - 1, 0) * 100 + percent) / shares, (streams * 100) / shares);
        }
      },
    );
  } catch (error) {
    if (!(error instanceof ProcessError)) throw error;
    video.status = 'failed';
    video.error = categorise(error.stderr, source.errorPatterns, download.sessionUsed ?? false);
    return;
  }

  if (oversized !== undefined) {
    video.status = 'failed';
    video.error = tooLarge(oversized.bytes, oversized.line);
    return;
  }
  const path = videoPath(download.id, video.index);
  if (!(await Bun.file(path).exists())) {
    video.status = 'failed';
    video.error = downloadError('unrecognised', `yt-dlp did not produce ${path}`);
    return;
  }
  try {
    await transcode(job, path, (fraction) => {
      video.progress = Math.min(((streams + fraction) * 100) / shares, 100);
    });
  } catch (error) {
    if (!(error instanceof ProcessError)) throw error;
    video.status = 'failed';
    video.error = { ...downloadError('unrecognised', stderrTail(error.stderr)), message: 'Converting the video to H.264 failed.' };
    return;
  }
  const file = Bun.file(path);
  video.status = 'ready';
  video.progress = 100;
  video.sizeBytes = file.size;
}

/** Whether a yt-dlp `vcodec` (`avc1.640028`) or ffprobe `codec_name` (`h264`) is H.264. */
function isH264(codec: string | null | undefined): boolean {
  return !!codec && /^(avc|h264)/.test(codec);
}

// Re-encodes the video track of the prepared file at `path` to H.264 when it is
// anything else (Instagram's best resolution is often VP9 only), copying the
// audio, so the file plays in QuickTime and iOS. Already-H.264 files are left
// alone. `onProgress` gets 0–1 from ffmpeg's position against the duration.
// Both ffprobe and ffmpeg run on the job, so removal and the timeout kill them.
async function transcode(job: Job, path: string, onProgress: (fraction: number) => void): Promise<void> {
  const probe = await runProcess(job, [
    'ffprobe',
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=codec_name:format=duration',
    '-of',
    'json',
    path,
  ]);
  const info: { streams?: { codec_name?: string }[]; format?: { duration?: string } } = JSON.parse(probe.stdout);
  if (isH264(info.streams?.[0]?.codec_name)) return;

  const durationUs = Number(info.format?.duration) * 1_000_000;
  const output = `${path.slice(0, -'.mp4'.length)}.h264.mp4`;
  // ffmpeg writes `out_time_us=<microseconds>` lines to stdout via `-progress`.
  await runProcess(
    job,
    [
      'ffmpeg',
      '-nostdin',
      '-y',
      '-i',
      path,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'copy',
      '-movflags',
      '+faststart',
      '-progress',
      'pipe:1',
      '-nostats',
      output,
    ],
    (line) => {
      const outTimeUs = Number(line.match(/^out_time_us=(\d+)/)?.[1]);
      if (durationUs > 0 && Number.isFinite(outTimeUs)) onProgress(Math.min(outTimeUs / durationUs, 1));
    },
  );
  await rename(output, path);
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

/** Kills a Download's running yt-dlp or ffmpeg, if any, so its `prepare` resolves early. Leaves its files in place. */
export function cancel(downloadId: string): void {
  jobs.get(downloadId)?.controller.abort();
}

/** Kills a Download's running yt-dlp or ffmpeg, if any, and deletes its directory. */
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
