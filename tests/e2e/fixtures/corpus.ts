/**
 * The fixture corpus (#104): every file under `files/`, described as data so
 * specs upload byte-identical inputs and assert against this table instead of
 * magic strings. `generate-corpus.ts`, `prep-images.ts` and `make-video.swift`
 * produce the files; the files are committed and are the source of truth.
 *
 * Importing this module checks the corpus against the disk and throws if a
 * listed file is missing or has a different size, or if `files/` holds a file
 * the manifest does not list. A drifted fixture therefore fails the first spec
 * that loads it, not three specs later with a confusing assertion.
 *
 * What is deliberately NOT here: an over-limit file. Oversize is tested at
 * runtime: the sharex limit by lowering `MAX_SHAREX_UPLOAD_BYTES` on a stack
 * (#110), the 200 MB web limit by declaring an oversized `Content-Length`.
 *
 * `mimeType` is what the browser sends for the file through
 * `setInputFiles` (Playwright maps the extension), because that, not the
 * content, decides the Files screen `kind` and whether the app accepts it.
 * `webUpload` is the HTTP status of `POST /api/upload/web` for the file: 200
 * accepted, 400 refused as empty, 415 refused as an unsupported type. The
 * uploader's own client-side validation refuses the same two files before any
 * request is made.
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** What the Files screen shows for a file, derived by the app from `mimeType`'s prefix. */
export type FileKind = 'image' | 'video' | 'audio' | 'file';

/** Why an entry exists beyond being a plain sample. */
export type EdgeCase =
  /** JPEG with camera and GPS EXIF; the scrubber must strip it. */
  | 'gps-exif'
  /** Nothing to store; web upload answers 400. */
  | 'zero-byte'
  /** Name with spaces, diacritics and an emoji. */
  | 'unicode-name'
  /** PNG bytes under a `.txt` name and `text/plain` type. */
  | 'mismatched-extension'
  /** `application/wasm` is not on the upload allowlist; web upload answers 415. */
  | 'unsupported-type'
  /** No extension, so the browser sends no type and it arrives as `application/octet-stream`. */
  | 'no-extension'
  /** `.ts` is `video/mp2t` to the browser, so the app files TypeScript source under video. */
  | 'ts-reads-as-video';

export interface CorpusEntry {
  /** File name in `files/`, also the name it uploads under. */
  name: string;
  /** Absolute path on disk. */
  path: string;
  mimeType: string;
  kind: FileKind;
  size: number;
  /** Pixel size; images, and the video frame. */
  dimensions?: { width: number; height: number };
  animated: boolean;
  /** Has an alpha channel with real transparency. */
  transparent: boolean;
  /** Carries metadata worth scrubbing: GPS/camera EXIF, or PDF author/creator. */
  hasMetadata: boolean;
  edgeCase?: EdgeCase;
  webUpload: 200 | 400 | 415;
}

type RawEntry = Omit<CorpusEntry, 'path' | 'animated' | 'transparent' | 'hasMetadata'> &
  Partial<Pick<CorpusEntry, 'animated' | 'transparent' | 'hasMetadata'>>;

const filesDir = join(import.meta.dirname, 'files');

const rawEntries: RawEntry[] = [
  {
    name: 'landscape-photo.jpg',
    mimeType: 'image/jpeg',
    kind: 'image',
    size: 593337,
    dimensions: { width: 2400, height: 1600 },
    webUpload: 200,
  },
  {
    name: 'forest-path.jpg',
    mimeType: 'image/jpeg',
    kind: 'image',
    size: 567176,
    dimensions: { width: 1600, height: 1067 },
    webUpload: 200,
  },
  {
    name: 'portrait-tall.webp',
    mimeType: 'image/webp',
    kind: 'image',
    size: 294012,
    dimensions: { width: 900, height: 1600 },
    webUpload: 200,
  },
  {
    name: 'ocean-wave.webp',
    mimeType: 'image/webp',
    kind: 'image',
    size: 344732,
    dimensions: { width: 1920, height: 1080 },
    webUpload: 200,
  },
  {
    name: 'panorama-wide.avif',
    mimeType: 'image/avif',
    kind: 'image',
    size: 85287,
    dimensions: { width: 3000, height: 600 },
    webUpload: 200,
  },
  { name: 'icon-small.png', mimeType: 'image/png', kind: 'image', size: 11160, dimensions: { width: 128, height: 128 }, webUpload: 200 },
  {
    name: 'square-food.png',
    mimeType: 'image/png',
    kind: 'image',
    size: 558698,
    dimensions: { width: 1024, height: 1024 },
    webUpload: 200,
  },
  {
    name: 'robot-illustration.png',
    mimeType: 'image/png',
    kind: 'image',
    size: 1105974,
    dimensions: { width: 1200, height: 900 },
    webUpload: 200,
  },
  {
    name: 'transparent-sticker.png',
    mimeType: 'image/png',
    kind: 'image',
    size: 787988,
    dimensions: { width: 800, height: 800 },
    transparent: true,
    webUpload: 200,
  },
  {
    name: 'transparent-logo.png',
    mimeType: 'image/png',
    kind: 'image',
    size: 85787,
    dimensions: { width: 600, height: 300 },
    transparent: true,
    webUpload: 200,
  },
  { name: 'tiny-pixel.png', mimeType: 'image/png', kind: 'image', size: 90, dimensions: { width: 1, height: 1 }, webUpload: 200 },
  {
    name: 'animation.gif',
    mimeType: 'image/gif',
    kind: 'image',
    size: 74210,
    dimensions: { width: 400, height: 400 },
    animated: true,
    webUpload: 200,
  },
  { name: 'vector.svg', mimeType: 'image/svg+xml', kind: 'image', size: 345, dimensions: { width: 320, height: 200 }, webUpload: 200 },
  {
    name: 'gps-photo.jpg',
    mimeType: 'image/jpeg',
    kind: 'image',
    size: 164026,
    dimensions: { width: 800, height: 534 },
    hasMetadata: true,
    edgeCase: 'gps-exif',
    webUpload: 200,
  },
  { name: 'document.pdf', mimeType: 'application/pdf', kind: 'file', size: 1292, hasMetadata: true, webUpload: 200 },
  { name: 'bundle.zip', mimeType: 'application/zip', kind: 'file', size: 588, webUpload: 200 },
  { name: 'archive.gz', mimeType: 'application/gzip', kind: 'file', size: 126, webUpload: 200 },
  { name: 'tone.mp3', mimeType: 'audio/mpeg', kind: 'audio', size: 47955, webUpload: 200 },
  { name: 'clip.mp4', mimeType: 'video/mp4', kind: 'video', size: 13922, dimensions: { width: 320, height: 240 }, webUpload: 200 },
  { name: 'notes.txt', mimeType: 'text/plain', kind: 'file', size: 115, webUpload: 200 },
  { name: 'readme.md', mimeType: 'text/markdown', kind: 'file', size: 102, webUpload: 200 },
  { name: 'snippet.ts', mimeType: 'video/mp2t', kind: 'video', size: 95, edgeCase: 'ts-reads-as-video', webUpload: 200 },
  { name: 'script.py', mimeType: 'application/octet-stream', kind: 'file', size: 112, webUpload: 200 },
  { name: 'server.go', mimeType: 'application/octet-stream', kind: 'file', size: 72, webUpload: 200 },
  { name: 'styles.css', mimeType: 'text/css', kind: 'file', size: 78, webUpload: 200 },
  { name: 'page.html', mimeType: 'text/html', kind: 'file', size: 129, webUpload: 200 },
  { name: 'data.json', mimeType: 'application/json', kind: 'file', size: 108, webUpload: 200 },
  { name: 'report.csv', mimeType: 'text/csv', kind: 'file', size: 45, webUpload: 200 },
  { name: 'feed.xml', mimeType: 'application/xml', kind: 'file', size: 138, webUpload: 200 },
  { name: 'config.yaml', mimeType: 'text/yaml', kind: 'file', size: 51, webUpload: 200 },
  { name: 'large-log.txt', mimeType: 'text/plain', kind: 'file', size: 684000, webUpload: 200 },
  { name: 'LICENSE', mimeType: 'application/octet-stream', kind: 'file', size: 44, edgeCase: 'no-extension', webUpload: 200 },
  { name: 'empty.txt', mimeType: 'text/plain', kind: 'file', size: 0, edgeCase: 'zero-byte', webUpload: 400 },
  { name: 'Ünïcödé 🌙 holiday notes.txt', mimeType: 'text/plain', kind: 'file', size: 75, edgeCase: 'unicode-name', webUpload: 200 },
  { name: 'actually-a-png.txt', mimeType: 'text/plain', kind: 'file', size: 11160, edgeCase: 'mismatched-extension', webUpload: 200 },
  { name: 'module.wasm', mimeType: 'application/wasm', kind: 'file', size: 8, edgeCase: 'unsupported-type', webUpload: 415 },
];

const entries: CorpusEntry[] = rawEntries.map((e) => ({
  ...e,
  path: join(filesDir, e.name),
  animated: e.animated ?? false,
  transparent: e.transparent ?? false,
  hasMetadata: e.hasMetadata ?? false,
}));

function assertCorpusMatchesDisk(): void {
  const problems: string[] = [];
  for (const entry of entries) {
    try {
      const { size } = statSync(entry.path);
      if (size !== entry.size) problems.push(`${entry.name}: ${size} bytes on disk, manifest says ${entry.size}`);
    } catch {
      problems.push(`${entry.name}: missing from fixtures/files`);
    }
  }
  const listed = new Set(entries.map((e) => e.name));
  for (const name of readdirSync(filesDir)) {
    if (!listed.has(name)) problems.push(`${name}: in fixtures/files but not in the manifest`);
  }
  if (problems.length > 0) {
    throw new Error(`Fixture corpus is out of sync with its manifest:\n  ${problems.join('\n  ')}`);
  }
}
assertCorpusMatchesDisk();

/** Every entry, in manifest order. */
export const CORPUS: readonly CorpusEntry[] = entries;

/** The entry called `name`; throws when there is none, so a typo fails loudly. */
export function corpusFile(name: string): CorpusEntry {
  const entry = entries.find((e) => e.name === name);
  if (!entry) throw new Error(`No fixture named "${name}"; see tests/e2e/fixtures/corpus.ts`);
  return entry;
}

/** All entries the Files screen shows as `kind`. */
export function corpusByKind(kind: FileKind): CorpusEntry[] {
  return entries.filter((e) => e.kind === kind);
}

/** The entry that represents `edgeCase`. */
export function corpusEdgeCase(edgeCase: EdgeCase): CorpusEntry {
  const entry = entries.find((e) => e.edgeCase === edgeCase);
  if (!entry) throw new Error(`No fixture for edge case "${edgeCase}"`);
  return entry;
}

/** Entries `POST /api/upload/web` accepts. */
export function corpusUploadable(): CorpusEntry[] {
  return entries.filter((e) => e.webUpload === 200);
}
