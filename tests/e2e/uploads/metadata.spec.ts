import { readFileSync } from 'node:fs';
import { expect } from '@playwright/test';
import exifr from 'exifr';
import { PDFDocument } from 'pdf-lib';
import { GPS_LATITUDE, GPS_LONGITUDE, PDF_AUTHOR, PDF_CREATOR } from '../fixtures/corpus-metadata';
import { test } from '../fixtures/test';
import { uniquePrefix } from '../utils/own-files';
import { storedFile } from '../utils/uploads';

// Metadata on web upload. The stored object is read back from the bucket and parsed with
// exifr / pdf-lib, and the file row's scrub report lists what the upload carried.

/** Uploads one corpus file through `/api/upload/web`. */
async function upload(
  request: import('@playwright/test').APIRequestContext,
  entry: { name: string; mimeType: string; path: string },
  title: string,
): Promise<void> {
  const response = await request.post('/api/upload/web', {
    multipart: {
      file: { name: entry.name, mimeType: entry.mimeType, buffer: readFileSync(entry.path) },
      filename: title,
    },
  });
  expect(response.status()).toBe(200);
}

const reportOf = (scrubReport: unknown) => scrubReport as { findings: { category: string }[] };

test('the stored JPEG keeps its GPS and camera tags, and the report lists the location', async ({ workerRequest, corpus, db, bucket }) => {
  const entry = corpus.edgeCase('gps-exif');
  const title = `${uniquePrefix('keep-jpg')} ${entry.name}`;

  await upload(workerRequest, entry, title);

  const stored = await storedFile(db, bucket, title);
  expect(stored.bytes.equals(readFileSync(entry.path))).toBe(true);
  const gps = await exifr.gps(stored.bytes);
  expect(gps?.latitude).toBeCloseTo(GPS_LATITUDE, 3);
  expect(gps?.longitude).toBeCloseTo(GPS_LONGITUDE, 3);
  const tags = await exifr.parse(stored.bytes, true);
  expect(tags.Make).toBe('LunaCam');
  expect(reportOf(stored.scrubReport).findings.map((finding) => finding.category)).toContain('gps');
});

test('the stored PDF keeps its author and creator', async ({ workerRequest, corpus, db, bucket }) => {
  const entry = corpus.file('document.pdf');
  const title = `${uniquePrefix('keep-pdf')} ${entry.name}`;

  await upload(workerRequest, entry, title);

  const stored = await storedFile(db, bucket, title);
  expect(stored.bytes.equals(readFileSync(entry.path))).toBe(true);
  const pdf = await PDFDocument.load(stored.bytes, { updateMetadata: false });
  expect(pdf.getAuthor()).toBe(PDF_AUTHOR);
  expect(pdf.getCreator()).toBe(PDF_CREATOR);
});
