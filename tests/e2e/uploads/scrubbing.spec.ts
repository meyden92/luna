import { readFileSync } from 'node:fs';
import { expect } from '@playwright/test';
import exifr from 'exifr';
import { PDFDocument } from 'pdf-lib';
import { GPS_LATITUDE, GPS_LONGITUDE, PDF_AUTHOR, PDF_CREATOR } from '../fixtures/corpus-metadata';
import { test } from '../fixtures/test';
import { uniquePrefix } from '../utils/own-files';
import { storedFile } from '../utils/uploads';

// Metadata scrubbing on web upload. The stored object is read back from the bucket and parsed
// with exifr / pdf-lib, and the file row's scrub report says what happened. The Upload sheet
// does not send the option, so these go through `/api/upload/web` with `stripMetadata`
// (the ShareX Token's own strip option is covered in sharex-options.spec.ts).

/** Uploads one corpus file with the form's `stripMetadata` field set as given. */
async function upload(
  request: import('@playwright/test').APIRequestContext,
  entry: { name: string; mimeType: string; path: string },
  title: string,
  stripMetadata: boolean,
): Promise<void> {
  const response = await request.post('/api/upload/web', {
    multipart: {
      file: { name: entry.name, mimeType: entry.mimeType, buffer: readFileSync(entry.path) },
      filename: title,
      stripMetadata: String(stripMetadata),
    },
  });
  expect(response.status()).toBe(200);
}

const reportOf = (scrubReport: unknown) => scrubReport as { stripped: boolean; findings: { category: string }[] };

test('with stripping on, the stored JPEG has no GPS or camera tags', async ({ workerRequest, corpus, db, bucket }) => {
  const entry = corpus.edgeCase('gps-exif');
  const title = `${uniquePrefix('scrub-jpg')} ${entry.name}`;

  await upload(workerRequest, entry, title, true);

  const stored = await storedFile(db, bucket, title);
  const tags = (await exifr.parse(stored.bytes, true)) ?? {};
  expect(await exifr.gps(stored.bytes)).toBeUndefined();
  expect(tags).not.toHaveProperty('latitude');
  expect(tags).not.toHaveProperty('GPSLatitude');
  expect(tags).not.toHaveProperty('Make');
  expect(tags).not.toHaveProperty('Model');
  expect(reportOf(stored.scrubReport).stripped).toBe(true);
  expect(stored.bytes.length).toBeLessThan(entry.size);
});

test('with stripping off, the stored JPEG keeps its GPS and camera tags', async ({ workerRequest, corpus, db, bucket }) => {
  const entry = corpus.edgeCase('gps-exif');
  const title = `${uniquePrefix('keep-jpg')} ${entry.name}`;

  await upload(workerRequest, entry, title, false);

  const stored = await storedFile(db, bucket, title);
  expect(stored.bytes.equals(readFileSync(entry.path))).toBe(true);
  const gps = await exifr.gps(stored.bytes);
  expect(gps?.latitude).toBeCloseTo(GPS_LATITUDE, 3);
  expect(gps?.longitude).toBeCloseTo(GPS_LONGITUDE, 3);
  const tags = await exifr.parse(stored.bytes, true);
  expect(tags.Make).toBe('LunaCam');
  const report = reportOf(stored.scrubReport);
  expect(report.stripped).toBe(false);
  expect(report.findings.map((finding) => finding.category)).toContain('gps');
});

test('with stripping on, the stored PDF has no author or creator', async ({ workerRequest, corpus, db, bucket }) => {
  const entry = corpus.file('document.pdf');
  const title = `${uniquePrefix('scrub-pdf')} ${entry.name}`;

  await upload(workerRequest, entry, title, true);

  const stored = await storedFile(db, bucket, title);
  const pdf = await PDFDocument.load(stored.bytes, { updateMetadata: false });
  expect(pdf.getAuthor() ?? '').toBe('');
  expect(pdf.getCreator()).not.toBe(PDF_CREATOR);
  expect(stored.bytes.toString('latin1')).not.toContain(PDF_AUTHOR);
  expect(reportOf(stored.scrubReport).stripped).toBe(true);
});

test('with stripping off, the stored PDF keeps its author and creator', async ({ workerRequest, corpus, db, bucket }) => {
  const entry = corpus.file('document.pdf');
  const title = `${uniquePrefix('keep-pdf')} ${entry.name}`;

  await upload(workerRequest, entry, title, false);

  const stored = await storedFile(db, bucket, title);
  expect(stored.bytes.equals(readFileSync(entry.path))).toBe(true);
  const pdf = await PDFDocument.load(stored.bytes, { updateMetadata: false });
  expect(pdf.getAuthor()).toBe(PDF_AUTHOR);
  expect(pdf.getCreator()).toBe(PDF_CREATOR);
  expect(reportOf(stored.scrubReport).stripped).toBe(false);
});
