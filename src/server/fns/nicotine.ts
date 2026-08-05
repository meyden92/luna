import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { userIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

export type NicotineKind = 'smoking' | 'nicorette';

export interface NicotineEntryDTO {
  id: string;
  kind: NicotineKind;
  note: string | null;
  occurredAt: string;
  createdAt: string;
}

export interface NicotineEntriesPayload {
  entries: NicotineEntryDTO[];
  asOf: string;
}

const createNicotineEntrySchema = z.object({
  kind: z.enum(['smoking', 'nicorette']),
  note: z.string().trim().max(500).optional(),
});

const updateNicotineEntrySchema = createNicotineEntrySchema.extend({
  id: z.string().min(1),
  occurredAt: z.iso.datetime(),
});

const nicotineEntryIdSchema = z.object({
  id: z.string().min(1),
});

export type CreateNicotineEntryInput = z.infer<typeof createNicotineEntrySchema>;
export type UpdateNicotineEntryInput = z.infer<typeof updateNicotineEntrySchema>;

type NicotineEntryRow = {
  id: string;
  kind: string;
  note: string | null;
  occurredAt: Date;
  createdAt: Date;
};

const toNicotineEntryDTO = (entry: NicotineEntryRow): NicotineEntryDTO => ({
  id: entry.id,
  kind: entry.kind as NicotineKind,
  note: entry.note,
  occurredAt: entry.occurredAt.toISOString(),
  createdAt: entry.createdAt.toISOString(),
});

export const listNicotineEntries = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .handler(async ({ context }) => {
    const { default: prisma } = await import('@/libs/prismadb');
    const entries = await prisma.nicotineEntry.findMany({
      where: { ownerId: userIdFromCtx(context) },
      orderBy: { occurredAt: 'desc' },
      select: {
        id: true,
        kind: true,
        note: true,
        occurredAt: true,
        createdAt: true,
      },
    });
    return {
      entries: entries.map(toNicotineEntryDTO),
      asOf: new Date().toISOString(),
    } satisfies NicotineEntriesPayload;
  });

export const createNicotineEntry = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(createNicotineEntrySchema)
  .handler(async ({ data, context }) => {
    const { default: prisma } = await import('@/libs/prismadb');
    const entry = await prisma.nicotineEntry.create({
      data: {
        kind: data.kind,
        note: data.kind === 'smoking' ? data.note || null : null,
        ownerId: userIdFromCtx(context),
      },
      select: {
        id: true,
        kind: true,
        note: true,
        occurredAt: true,
        createdAt: true,
      },
    });
    return toNicotineEntryDTO(entry);
  });

export const updateNicotineEntry = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(updateNicotineEntrySchema)
  .handler(async ({ data, context }) => {
    const { default: prisma } = await import('@/libs/prismadb');
    const entry = await prisma.nicotineEntry.update({
      where: { id: data.id, ownerId: userIdFromCtx(context) },
      data: {
        kind: data.kind,
        note: data.kind === 'smoking' ? data.note || null : null,
        occurredAt: new Date(data.occurredAt),
      },
      select: {
        id: true,
        kind: true,
        note: true,
        occurredAt: true,
        createdAt: true,
      },
    });
    return toNicotineEntryDTO(entry);
  });

export const deleteNicotineEntry = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(nicotineEntryIdSchema)
  .handler(async ({ data, context }) => {
    const { default: prisma } = await import('@/libs/prismadb');
    await prisma.nicotineEntry.delete({
      where: { id: data.id, ownerId: userIdFromCtx(context) },
    });
    return { id: data.id };
  });
