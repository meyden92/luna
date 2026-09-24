import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { getOwnedFormShareId } from '@/db/queries/analytics';
import { getOwnedFile } from '@/db/queries/files';
import { getViewStats } from '@/libs/analytics/view-events';
import { userIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

const targetStatsSchema = z.object({
  kind: z.enum(['file', 'formShare']),
  id: z.string().min(1),
});

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
