import { readFileSync } from 'node:fs';
import type { CorpusEntry } from '../fixtures/corpus';
import type { TestDb } from '../fixtures/db';
import type { GalleryDataset } from '../fixtures/gallery';
import { galleryFileIds } from './preview';

/** A seeded gallery file as the serving routes know it: its id, title, corpus source and expected bytes. */
export interface ServedFile {
  id: string;
  title: string;
  entry: CorpusEntry;
  /** The bytes the app must serve back (the corpus file; the seed stores it unchanged). */
  bytes: Buffer;
}

/**
 * The first seeded gallery file made from the corpus file `name` with the given visibility, as the gallery
 * user's data. Serving specs only read these files, so they never need to upload their own.
 */
export async function servedFile(gallery: GalleryDataset, db: TestDb, name: string, options: { private: boolean }): Promise<ServedFile> {
  const match = gallery.files.find((candidate) => candidate.source.name === name && candidate.private === options.private);
  if (!match) throw new Error(`The gallery has no ${options.private ? 'private' : 'public'} copy of ${name}`);
  const id = (await galleryFileIds(db)).get(match.title);
  if (!id) throw new Error(`${match.title} is not in the database`);
  return { id, title: match.title, entry: match.source, bytes: readFileSync(match.source.path) };
}
