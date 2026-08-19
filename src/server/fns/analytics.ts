import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { getOwnedFormShareId } from '@/db/queries/analytics';
import { getOwnedFile } from '@/db/queries/files';
import { getOwnerViewSummary, getViewStats } from '@/libs/analytics/view-events';
import { getEgressSummary } from '@/libs/egress/record';
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
      if (!(await getOwnedFile(data.id, userId))) throw new Error('File not found');
    } else {
      if (!(await getOwnedFormShareId(data.id, userId))) throw new Error('Share not found');
    }
    return getViewStats(data.kind, data.id, userId);
  });
