import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Subprocess } from 'bun';
import { sources } from './sources';
import type { Download, DownloadError, Video } from './types';

/** One directory per Download lives under here. */
const TEMP_ROOT = join(tmpdir(), 'lunashare-downloads');
const STDERR_TAIL_LINES = 20;
const CAPTION_SNIPPET_LENGTH = 200;
// Best video plus best audio, preferring H.264/AAC so the merged MP4 plays everywhere.
const FORMAT_ARGS = ['-f', 'bv*+ba/b', '-S', 'vcodec:h264,res,acodec:m4a'];

interface Job {
  controller: AbortController;
  process?: Subprocess<'ignore', 'pipe', 'pipe'>;
  /** Settles once preparation has stopped, so nothing writes to disk after `discard`. */
  done?: Promise<void>;
}

/** The running preparation of each Download, so `cancel` can kill it. */
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
 * Prepares a Download's one video, mutating `download` as it goes:
 * resolve the post with `yt-dlp -J`, then download and merge it into
 * `<tmp>/lunashare-downloads/<id>/1.mp4`. Never rejects; failures land on the
 * Download. yt-dlp only ever sees the Source's extractor and the canonical URL.
 */
export async function prepare(download: Download): Promise<void> {
  const job: Job = { controller: new AbortController() };
  jobs.set(download.id, job);
  job.done = run(download, job).finally(() => jobs.delete(download.id));
  await job.done;
}

async function run(download: Download, job: Job): Promise<void> {
  const { signal } = job.controller;

  try {
    const source = sources.get(download.sourceKey);
    if (!source) throw new Error(`Unknown Source ${download.sourceKey}`);
    const base = ['--use-extractors', source.extractor];

    // Resolve with the same format selection as the download, so width and
    // height describe the formats that will actually be merged.
    const info = JSON.parse(await runYtDlp(job, ['-J', ...base, ...FORMAT_ARGS, download.canonicalUrl]));
    if (signal.aborted) return;
    if (info._type !== 'video') {
      download.status = 'failed';
      download.error = { ...unrecognised(''), message: 'Only single-video posts are supported for now.' };
      return;
    }

    const account = typeof info.channel === 'string' ? info.channel.replace(/[^A-Za-z0-9._-]/g, '') : '';
    download.account = account || undefined;
    download.caption = captionSnippet(info.description);
    const video: Video = {
      index: 1,
      status: 'preparing',
      progress: 0,
      filename: account ? `${account}_${download.shortcode}.mp4` : `${download.shortcode}.mp4`,
    };
    download.videos = [video];

    const dir = join(TEMP_ROOT, download.id);
    await mkdir(dir, { recursive: true });
    try {
      await runYtDlp(
        job,
        [
          ...base,
          ...FORMAT_ARGS,
          '--merge-output-format',
          'mp4',
          '--newline',
          '--progress-template',
          'download:%(progress._percent_str)s',
          '-o',
          join(dir, `${video.index}.%(ext)s`),
          download.canonicalUrl,
        ],
        (line) => {
          const percent = Number.parseFloat(line);
          if (line.trim().endsWith('%') && Number.isFinite(percent)) video.progress = percent;
        },
      );
    } catch (error) {
      if (!(error instanceof YtDlpError)) throw error;
      video.status = 'failed';
      video.error = unrecognised(error.stderr);
      download.status = 'failed';
      return;
    }

    const file = Bun.file(videoPath(download.id, video.index));
    if (!(await file.exists())) {
      video.status = 'failed';
      video.error = unrecognised(`yt-dlp did not produce ${file.name}`);
      download.status = 'failed';
      return;
    }
    video.status = 'ready';
    video.progress = 100;
    video.width = typeof info.width === 'number' ? info.width : undefined;
    video.height = typeof info.height === 'number' ? info.height : undefined;
    video.sizeBytes = file.size;
    download.status = 'ready';
    download.readyAt = new Date();
  } catch (error) {
    download.status = 'failed';
    download.error = unrecognised(error instanceof YtDlpError ? error.stderr : String(error));
  }
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
