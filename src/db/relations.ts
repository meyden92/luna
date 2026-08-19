import { defineRelations } from 'drizzle-orm';
import * as schema from './schema';

/**
 * Relations are declared only where relational queries need them, not for all
 * 38 models (issue #14) — nothing keeps these in sync with the schema, so each
 * declaration is a maintenance liability.
 *
 * Uses the v2 `defineRelations` API from the Drizzle 1.0 line (issue #25).
 */
export const relations = defineRelations(schema, (r) => ({
  file: {
    owner: r.one.user({ from: r.file.ownerId, to: r.user.id }),
    folder: r.one.folder({ from: r.file.folderId, to: r.folder.id, optional: true }),
    metadata: r.one.fileMetadata({ from: r.file.id, to: r.fileMetadata.fileId, optional: true }),
  },
  folder: {
    owner: r.one.user({ from: r.folder.ownerId, to: r.user.id }),
    files: r.many.file(),
  },
  user: {
    files: r.many.file(),
    folders: r.many.folder(),
  },
  fileMetadata: {
    file: r.one.file({ from: r.fileMetadata.fileId, to: r.file.id }),
  },
}));
