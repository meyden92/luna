import type { FFmpeg } from '@ffmpeg/ffmpeg';
import type { CropBox, CutSegment } from '@/hooks/stores/video-editor-store';
import { createFFmpegLoader, downloadBlob, readFileAsBytes, toArrayBuffer } from '../ffmpeg/load-core';

const { getFFmpeg } = createFFmpegLoader();
let ffmpegJobQueue: Promise<unknown> = Promise.resolve();

function runExclusive<T>(job: () => Promise<T>): Promise<T> {
  const next = ffmpegJobQueue.then(job, job);
  ffmpegJobQueue = next.catch(() => {});
  return next;
}

/**
 * Compute the ranges to KEEP after applying trim + cuts.
 * Returns disjoint, sorted ranges in seconds.
 *
 * Sub-50ms slivers are dropped (r.end - r.start > 0.05): adjacent or near-touching
 * cuts can leave segments shorter than a frame, which produce empty/garbage output
 * from the per-range encode and would only add concat overhead, so they're discarded.
 */
export function computeKeptRanges(trimStart: number, trimEnd: number, cuts: CutSegment[]): Array<{ start: number; end: number }> {
  const sorted = cuts
    .map((c) => ({ start: Math.max(c.start, trimStart), end: Math.min(c.end, trimEnd) }))
    .filter((c) => c.end > c.start)
    .sort((a, b) => a.start - b.start);

  const kept: Array<{ start: number; end: number }> = [];
  let cursor = trimStart;
  for (const cut of sorted) {
    if (cut.start > cursor) kept.push({ start: cursor, end: cut.start });
    cursor = Math.max(cursor, cut.end);
  }
  if (cursor < trimEnd) kept.push({ start: cursor, end: trimEnd });
  return kept.filter((r) => r.end - r.start > 0.05);
}

export interface ThumbnailOptions {
  count?: number;
  height?: number;
}

/**
 * Extract thumbnail strip as an array of caller-owned object URLs.
 * Release returned URLs with `revokeThumbnailUrls` when replacing or clearing them.
 */
export async function extractThumbnails(file: File, duration: number, opts: ThumbnailOptions = {}): Promise<string[]> {
  return runExclusive(async () => {
    const count = opts.count ?? 60;
    const height = opts.height ?? 80;

    const instance = await getFFmpeg();
    const inputName = 'thumb_input';
    const bytes = await readFileAsBytes(file);
    await instance.writeFile(inputName, bytes);

    try {
      // Emit `count` frames evenly across duration
      const fps = count / Math.max(duration, 0.1);
      const pattern = 'thumb_%04d.jpg';
      await instance.exec([
        '-i',
        inputName,
        '-vf',
        `fps=${fps.toFixed(6)},scale=-2:${height}`,
        '-q:v',
        '6',
        '-frames:v',
        String(count),
        pattern,
      ]);

      const urls: string[] = [];
      for (let i = 1; i <= count; i++) {
        const name = `thumb_${String(i).padStart(4, '0')}.jpg`;
        try {
          const data = (await instance.readFile(name)) as Uint8Array;
          const blob = new Blob([toArrayBuffer(data)], { type: 'image/jpeg' });
          urls.push(URL.createObjectURL(blob));
          await instance.deleteFile(name);
        } catch {
          break;
        }
      }

      return urls;
    } finally {
      try {
        await instance.deleteFile(inputName);
      } catch {
        // ignore
      }
    }
  });
}

export function revokeThumbnailUrls(urls: readonly string[]) {
  for (const url of urls) URL.revokeObjectURL(url);
}

export interface ExportOptions {
  file: File;
  trimStart: number;
  trimEnd: number;
  cuts: CutSegment[];
  crop: CropBox | null;
  videoWidth: number;
  videoHeight: number;
  onProgress?: (percent: number) => void;
}

/**
 * Export edited video as MP4 (H.264 + AAC). Re-encodes video so trim/cut
 * boundaries are frame-accurate; audio is copied when possible.
 */
export async function exportVideo(options: ExportOptions): Promise<Blob> {
  return runExclusive(() => exportVideoJob(options));
}

async function exportVideoJob(options: ExportOptions): Promise<Blob> {
  const { file, trimStart, trimEnd, cuts, crop, videoWidth, videoHeight, onProgress } = options;
  const instance = await getFFmpeg();

  const kept = computeKeptRanges(trimStart, trimEnd, cuts);
  if (kept.length === 0) throw new Error('Nothing to export — the full range is cut out.');

  const cropFilter = buildCropFilter(crop, videoWidth, videoHeight);
  const vfParts: string[] = [];
  if (cropFilter) vfParts.push(cropFilter);
  const vf = vfParts.join(',');

  const logMessages: string[] = [];
  const onLog = ({ type, message }: { type: string; message: string }) => {
    logMessages.push(`[${type}] ${message}`);
  };
  instance.on('log', onLog);

  const totalDuration = kept.reduce((sum, r) => sum + (r.end - r.start), 0);
  let completedBefore = 0;
  const onProgressEvent = ({ time }: { time: number }) => {
    // `time` is microseconds of current part's output
    if (!onProgress) return;
    const partSeconds = time / 1_000_000;
    const pct = Math.min(100, Math.round(((completedBefore + partSeconds) / totalDuration) * 100));
    onProgress(pct);
  };
  instance.on('progress', onProgressEvent);

  const inputName = 'edit_input';
  const bytes = await readFileAsBytes(file);
  await instance.writeFile(inputName, bytes);

  try {
    if (kept.length === 1) {
      const range = kept[0]!;
      const outputName = 'edit_output.mp4';
      const args = buildEncodeArgs(inputName, outputName, range.start, range.end, vf);
      await instance.exec(args);

      const data = await readOutput(instance, outputName, logMessages);
      await instance.deleteFile(outputName);
      completedBefore = totalDuration;
      onProgress?.(100);
      return new Blob([toArrayBuffer(data)], { type: 'video/mp4' });
    }

    // Multi-range: export each part then concat
    const partNames: string[] = [];
    for (let i = 0; i < kept.length; i++) {
      const range = kept[i]!;
      const partName = `part_${i}.mp4`;
      const args = buildEncodeArgs(inputName, partName, range.start, range.end, vf);
      await instance.exec(args);
      partNames.push(partName);
      completedBefore += range.end - range.start;
      onProgress?.(Math.min(99, Math.round((completedBefore / totalDuration) * 95)));
    }

    const listName = 'concat_list.txt';
    const listContent = partNames.map((n) => `file '${n}'`).join('\n');
    await instance.writeFile(listName, new TextEncoder().encode(listContent));

    const outputName = 'edit_output.mp4';
    await instance.exec(['-f', 'concat', '-safe', '0', '-i', listName, '-c', 'copy', outputName]);

    const data = await readOutput(instance, outputName, logMessages);

    await instance.deleteFile(outputName);
    await instance.deleteFile(listName);
    for (const n of partNames) await instance.deleteFile(n);

    onProgress?.(100);
    return new Blob([toArrayBuffer(data)], { type: 'video/mp4' });
  } finally {
    instance.off('log', onLog);
    instance.off('progress', onProgressEvent);
    try {
      await instance.deleteFile(inputName);
    } catch {
      // ignore
    }
  }
}

function buildEncodeArgs(input: string, output: string, start: number, end: number, vf: string): string[] {
  const args = ['-ss', start.toFixed(3), '-to', end.toFixed(3), '-i', input];
  if (vf) args.push('-vf', vf);
  args.push(
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    output,
  );
  return args;
}

function buildCropFilter(crop: CropBox | null, width: number, height: number): string | null {
  if (!crop || !width || !height) return null;
  const w = Math.max(2, Math.round(crop.w * width));
  const h = Math.max(2, Math.round(crop.h * height));
  const x = Math.max(0, Math.round(crop.x * width));
  const y = Math.max(0, Math.round(crop.y * height));
  if (w === width && h === height && x === 0 && y === 0) return null;
  // H.264 requires even dimensions
  const ew = w % 2 === 0 ? w : w - 1;
  const eh = h % 2 === 0 ? h : h - 1;
  return `crop=${ew}:${eh}:${x}:${y}`;
}

async function readOutput(instance: FFmpeg, name: string, logMessages: string[]): Promise<Uint8Array> {
  try {
    return (await instance.readFile(name)) as Uint8Array;
  } catch {
    const relevant = logMessages
      .filter((m) => /error|invalid|failed/i.test(m))
      .slice(-5)
      .join('\n');
    throw new Error(`Export failed. ${relevant || 'Check browser console for details.'}`);
  }
}

export { downloadBlob };

export function formatTime(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds >= 0 ? seconds : 0;
  const mins = Math.floor(safe / 60);
  const secs = safe - mins * 60;
  const m = String(mins).padStart(2, '0');
  const s = secs.toFixed(1).padStart(4, '0');
  return `${m}:${s}`;
}
