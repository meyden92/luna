import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import {
  createDenylistEntry,
  findOpenModerationCase,
  importDenylistEntries as importDenylistEntryRows,
  listDenylistEntries as listDenylistEntryRows,
  listModerationQueue as listModerationQueueRows,
  listRescanCandidates,
  quarantineFile,
  resolveModerationCase as resolveModerationCaseRow,
} from '@/db/queries/moderation';
import { type FileHashes, findDenylistMatchForHashes } from '@/libs/moderation/hash-gate';
import { userIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

const RESCAN_PAGE_SIZE = 250;

const denylistEntrySchema = z.object({
  hashType: z.enum(['sha256', 'md5', 'phash']),
  hash: z.string().min(8).max(128),
  severity: z.string().min(1).max(32).default('block'),
  notes: z.string().max(500).optional(),
});

const importDenylistSchema = z.object({
  source: z.string().min(1).max(64).default('private-import'),
  entries: z
    .array(
      z.object({
        hashType: z.enum(['sha256', 'md5', 'phash']),
        hash: z.string().min(8).max(128),
        severity: z.string().min(1).max(32).default('block'),
        notes: z.string().max(500).optional(),
      }),
    )
    .min(1)
    .max(1000),
});

const resolveModerationCaseSchema = z.object({
  id: z.string().min(1),
  action: z.enum(['confirm', 'release', 'escalate']),
  resolution: z.string().max(1000).optional(),
});

export const listModerationQueue = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .handler(async () => listModerationQueueRows());

export const listDenylistEntries = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .handler(async () => listDenylistEntryRows());

export const addDenylistEntry = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(denylistEntrySchema)
  .handler(async ({ data, context }) => {
    const userId = userIdFromCtx(context);
    return createDenylistEntry({ ...data, addedBy: userId }, userId);
  });

export const importDenylistEntries = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(importDenylistSchema)
  .handler(async ({ data, context }) => {
    const userId = userIdFromCtx(context);
    return importDenylistEntryRows({ source: data.source, entries: data.entries, addedBy: userId }, userId);
  });

export const resolveModerationCase = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(resolveModerationCaseSchema)
  .handler(async ({ data, context }) => {
    const userId = userIdFromCtx(context);
    const status = data.action === 'confirm' ? 'confirmed' : data.action === 'release' ? 'released' : 'escalated';
    await resolveModerationCaseRow({ id: data.id, status, resolution: data.resolution, reviewerId: userId }, userId);
    return { success: true };
  });

export const rescanModerationHashes = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .handler(async ({ context }) => {
    const reviewerId = userIdFromCtx(context);
    let scanned = 0;
    let matched = 0;
    let cursor: string | undefined;

    for (;;) {
      const files = await listRescanCandidates({ cursor, limit: RESCAN_PAGE_SIZE });
      if (files.length === 0) break;

      for (const file of files) {
        scanned += 1;
        if (!file.sha256 || !file.md5) continue;
        const match = await findDenylistMatchForHashes({ sha256: file.sha256, md5: file.md5, phash: file.phash } satisfies FileHashes);
        if (!match) continue;
        if (await findOpenModerationCase(file.id)) continue;

        await quarantineFile(
          {
            fileId: file.id,
            matchType: match.matchType,
            matchedEntryId: match.matchedEntryId,
            distance: match.distance,
            uploaderId: file.ownerId,
            reviewerId,
            uploadMetadata: { source: 'admin-rescan' },
          },
          reviewerId,
        );
        matched += 1;
      }

      cursor = files.at(-1)?.id;
      if (files.length < RESCAN_PAGE_SIZE || !cursor) break;
    }

    return { scanned, matched };
  });
