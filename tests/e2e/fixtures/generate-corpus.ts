/**
 * One-off generator for every non-image file of the fixture corpus (#104).
 * The output in `files/` is committed; rerun to reproduce it byte for byte:
 *
 *   bun tests/e2e/fixtures/generate-corpus.ts
 *
 * Images come from `prep-images.ts` and `clip.mp4` from `make-video.swift`
 * (no ffmpeg on the dev host). The MP3 is written by hand as silent MPEG-1
 * Layer III frames, so no encoder is needed. Two outputs are derived from
 * committed images: `gps-photo.jpg` (from `forest-path.jpg`) and
 * `actually-a-png.txt` (a copy of `icon-small.png`).
 *
 * The metadata-carrying files are read back and asserted, so a generator that
 * silently drops the EXIF or PDF metadata fails here instead of in a spec.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import exifr from 'exifr';
import { gzipSync, zipSync } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { GPS_LATITUDE, GPS_LONGITUDE, PDF_AUTHOR, PDF_CREATOR } from './corpus-metadata';

const dir = join(import.meta.dirname, 'files');
mkdirSync(dir, { recursive: true });
const write = (name: string, data: string | Uint8Array) => writeFileSync(join(dir, name), data);

const enc = (s: string) => new TextEncoder().encode(s);
/** Bytes of one of the `textFiles` below. */
function textOf(name: string): Uint8Array {
  const text = textFiles[name];
  if (text === undefined) throw new Error(`no text file ${name}`);
  return enc(text);
}

const textFiles: Record<string, string> = {
  'notes.txt': 'LunaShare end-to-end fixture.\nSecond line of the plain text file.\nThird line, with unicode: café, naïve, 你好.\n',
  'readme.md': '# Fixture readme\n\nA **Markdown** file with a list:\n\n- one\n- two\n- three\n\n```ts\nconst answer = 42;\n```\n',
  'snippet.ts': 'export function add(a: number, b: number): number {\n  return a + b;\n}\n\nconsole.log(add(2, 3));\n',
  'script.py': 'def greet(name: str) -> str:\n    return f"Hello, {name}!"\n\n\nif __name__ == "__main__":\n    print(greet("Luna"))\n',
  'server.go': 'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Hello, Luna")\n}\n',
  'styles.css': ':root {\n  --accent: #7c5cff;\n}\n\nbody {\n  margin: 0;\n  color: var(--accent);\n}\n',
  'page.html':
    '<!doctype html>\n<html lang="en">\n  <head><title>Fixture page</title></head>\n  <body><h1>Hello from a fixture</h1></body>\n</html>\n',
  'data.json': `${JSON.stringify({ name: 'fixture', tags: ['a', 'b'], nested: { ok: true, count: 3 } }, null, 2)}\n`,
  'report.csv': 'id,name,score\n1,Ada,92\n2,Linus,88\n3,Grace,97\n',
  'feed.xml':
    '<?xml version="1.0" encoding="UTF-8"?>\n<feed><entry id="1"><title>First</title></entry><entry id="2"><title>Second</title></entry></feed>\n',
  // No extension at all: the browser sends no type, so it arrives as application/octet-stream.
  LICENSE: 'Fixture licence text. Do whatever you like.\n',
  'config.yaml': 'name: fixture\nretries: 3\nhosts:\n  - alpha\n  - beta\n',
  // About 1 MiB of deterministic log lines, for a text file bigger than one screen.
  'large-log.txt':
    Array.from({ length: 12000 }, (_, i) => `2026-01-01T00:00:00Z INFO line ${String(i).padStart(5, '0')} the quick brown fox`).join('\n') +
    '\n',
  // Unicode, emoji and spaces in the name (NFC, so it survives macOS and Linux alike).
  ['Ünïcödé 🌙 holiday notes.txt'.normalize('NFC')]: 'The name of this file has spaces, diacritics, an emoji and CJK: 日本語.\n',
};
for (const [name, content] of Object.entries(textFiles)) write(name, content);

// Hand-written SVG.
write(
  'vector.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">
  <rect width="320" height="200" fill="#1b1b2f"/>
  <circle cx="110" cy="100" r="60" fill="#7c5cff"/>
  <circle cx="140" cy="86" r="52" fill="#1b1b2f"/>
  <path d="M200 60 l16 36 38 4 -29 26 9 38 -34 -20 -34 20 9 -38 -29 -26 38 -4z" fill="#ffd166"/>
</svg>
`,
);

// Edge cases.
write('empty.txt', '');
write('module.wasm', Uint8Array.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00])); // application/wasm: refused by the allowlist
write('actually-a-png.txt', readFileSync(join(dir, 'icon-small.png')));

// JPEG with camera and GPS EXIF, derived from a committed image.
const dms = (deg: number) => {
  const d = Math.floor(deg);
  const m = Math.floor((deg - d) * 60);
  const s = Math.round(((deg - d) * 60 - m) * 60 * 100);
  return `${d}/1 ${m}/1 ${s}/100`;
};
const gpsJpeg = await sharp(join(dir, 'forest-path.jpg'))
  .resize(800)
  .withExif({
    IFD0: { Make: 'LunaCam', Model: 'Fixture 1', Software: 'e2e' },
    IFD3: {
      GPSLatitudeRef: 'N',
      GPSLatitude: dms(GPS_LATITUDE),
      GPSLongitudeRef: 'E',
      GPSLongitude: dms(GPS_LONGITUDE),
    },
  })
  .jpeg({ quality: 80 })
  .toBuffer();
const gps = await exifr.gps(gpsJpeg);
if (!gps || Math.abs(gps.latitude - GPS_LATITUDE) > 0.001 || Math.abs(gps.longitude - GPS_LONGITUDE) > 0.001) {
  throw new Error(`gps-photo.jpg did not keep its GPS EXIF: ${JSON.stringify(gps)}`);
}
write('gps-photo.jpg', gpsJpeg);

// PDF with author/creator metadata and fixed dates, so reruns are identical.
const pdf = await PDFDocument.create();
const fixedDate = new Date('2026-01-01T00:00:00Z');
pdf.setTitle('Fixture document');
pdf.setAuthor(PDF_AUTHOR);
pdf.setCreator(PDF_CREATOR);
pdf.setProducer(PDF_CREATOR);
pdf.setCreationDate(fixedDate);
pdf.setModificationDate(fixedDate);
pdf.addPage([400, 300]).drawText('LunaShare fixture PDF', { x: 50, y: 150, size: 24 });
const pdfBytes = await pdf.save({ useObjectStreams: false });
const reread = await PDFDocument.load(pdfBytes);
if (reread.getAuthor() !== PDF_AUTHOR || reread.getCreator() !== PDF_CREATOR) {
  throw new Error('document.pdf did not keep its author/creator metadata');
}
write('document.pdf', pdfBytes);

// ZIP holding three of the text files, with a fixed mtime.
const mtime = fixedDate.getTime();
write(
  'bundle.zip',
  zipSync({
    'notes.txt': [textOf('notes.txt'), { mtime }],
    'readme.md': [textOf('readme.md'), { mtime }],
    'data.json': [textOf('data.json'), { mtime }],
  }),
);

// A 1x1 PNG, the smallest image the thumbnailer can meet.
write(
  'tiny-pixel.png',
  await sharp({ create: { width: 1, height: 1, channels: 3, background: '#7c5cff' } })
    .png()
    .toBuffer(),
);

// Gzip of the plain text file (application/gzip is on the allowlist).
write('archive.gz', gzipSync(textOf('notes.txt'), { mtime }));

// MP3: 115 silent MPEG-1 Layer III frames (128 kbps, 44.1 kHz, 417 bytes each), about 3 s.
const frame = new Uint8Array(417);
frame.set([0xff, 0xfb, 0x90, 0x00]);
const mp3 = new Uint8Array(frame.length * 115);
for (let i = 0; i < 115; i++) mp3.set(frame, i * frame.length);
write('tone.mp3', mp3);
