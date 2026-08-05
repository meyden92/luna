import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { getOwnerViewSummary, getViewStats } from '@/libs/analytics/view-events';
import { getEgressSummary } from '@/libs/egress/record';
import prisma from '@/libs/prismadb';
import { userIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

const targetStatsSchema = z.object({
  kind: z.enum(['file', 'formShare']),
  id: z.string().min(1),
});

export const getMyEgressSummary = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .handler(({ context }) => getEgressSummary(userIdFromCtx(context)));

export const getMyViewSummary = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .handler(({ context }) => getOwnerViewSummary(userIdFromCtx(context)));

export const getTargetViewStats = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(targetStatsSchema)
  .handler(async ({ data, context }) => {
    const userId = userIdFromCtx(context);
    if (data.kind === 'file') {
      const file = await prisma.file.findFirst({ where: { id: data.id, ownerId: userId }, select: { id: true } });
      if (!file) throw new Error('File not found');
    } else {
      const share = await prisma.formShare.findFirst({ where: { id: data.id, ownerId: userId }, select: { id: true } });
      if (!share) throw new Error('Share not found');
    }
    return getViewStats(data.kind, data.id, userId);
  });
