import type { Prisma } from '@db/client';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { type FileHashes, findDenylistMatchForHashes } from '@/libs/moderation/hash-gate';
import prisma from '@/libs/prismadb';
import { userIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

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
  .handler(async () => {
    const cases = await prisma.moderationCase.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const files = await prisma.file.findMany({
      where: { id: { in: cases.map((item) => item.fileId) } },
      select: { id: true, title: true, ownerId: true, contentType: true, size: true, createdAt: true },
    });
    const filesById = new Map(files.map((file) => [file.id, file]));
    return cases.map((item) => ({
      ...item,
      file: filesById.get(item.fileId) ?? null,
    }));
  });

export const listDenylistEntries = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .handler(async () => {
    return prisma.denylistEntry.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  });

export const addDenylistEntry = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(denylistEntrySchema)
  .handler(async ({ data, context }) => {
    return prisma.denylistEntry.create({
      data: {
        hashType: data.hashType,
        hash: data.hash,
        severity: data.severity,
        notes: data.notes,
        addedBy: userIdFromCtx(context),
      },
    });
  });

export const importDenylistEntries = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(importDenylistSchema)
  .handler(async ({ data, context }) => {
    const userId = userIdFromCtx(context);
    const result = await prisma.denylistEntry.createMany({
      data: data.entries.map((entry) => ({
        hashType: entry.hashType,
        hash: entry.hash,
        severity: entry.severity,
        notes: entry.notes,
        source: data.source,
        addedBy: userId,
      })),
      skipDuplicates: true,
    });
    return { imported: result.count };
  });

export const resolveModerationCase = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(resolveModerationCaseSchema)
  .handler(async ({ data, context }) => {
    const status = data.action === 'confirm' ? 'confirmed' : data.action === 'release' ? 'released' : 'escalated';
    const moderationCase = await prisma.moderationCase.update({
      where: { id: data.id },
      data: {
        status,
        resolution: data.resolution,
        reviewerId: userIdFromCtx(context),
        resolvedAt: new Date(),
      },
    });

    if (data.action === 'release') {
      await prisma.file.update({ where: { id: moderationCase.fileId }, data: { moderationStatus: 'clear' } });
    } else if (data.action === 'confirm') {
      await prisma.file.update({
        where: { id: moderationCase.fileId },
        data: { isDeleted: true, deletedAt: new Date(), moderationStatus: 'confirmed' },
      });
    }

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
      const files = await prisma.file.findMany({
        where: {
          isDeleted: false,
          moderationStatus: { not: 'quarantined' },
          OR: [{ sha256: { not: null } }, { md5: { not: null } }, { phash: { not: null } }],
        },
        select: { id: true, ownerId: true, sha256: true, md5: true, phash: true },
        orderBy: { id: 'asc' },
        take: 250,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (files.length === 0) break;

      for (const file of files) {
        scanned += 1;
        if (!file.sha256 || !file.md5) continue;
        const match = await findDenylistMatchForHashes({ sha256: file.sha256, md5: file.md5, phash: file.phash } satisfies FileHashes);
        if (!match) continue;

        const existing = await prisma.moderationCase.findFirst({
          where: { fileId: file.id, status: 'quarantined' },
          select: { id: true },
        });
        if (existing) continue;

        await prisma.$transaction(async (tx) => {
          await tx.file.update({
            where: { id: file.id },
            data: { private: true, moderationStatus: 'quarantined' },
          });
          await tx.moderationCase.create({
            data: {
              fileId: file.id,
              status: 'quarantined',
              matchType: match.matchType,
              matchedEntryId: match.matchedEntryId,
              distance: match.distance,
              uploaderId: file.ownerId,
              reviewerId,
              uploadMetadata: { source: 'admin-rescan' } as Prisma.InputJsonValue,
            },
          });
        });
        matched += 1;
      }

      cursor = files.at(-1)?.id;
      if (files.length < 250 || !cursor) break;
    }

    return { scanned, matched };
  });
