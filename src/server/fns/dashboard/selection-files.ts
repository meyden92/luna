import { createServerFn } from '@tanstack/react-start';
import { endOfMonth, startOfMonth, subMonths } from 'date-fns';
import { z } from 'zod';
import { listOwnedFilesInRange } from '@/db/queries/files';
import { userIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

const dateRangeSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  submonth: z.string().optional(),
});

function resolveDateRange(params: z.infer<typeof dateRangeSchema>) {
  if (params.from && params.to) {
    return { from: new Date(params.from), to: new Date(params.to) };
  }
  if (params.submonth) {
    const monthsAgo = Number.parseInt(params.submonth, 10);
    const targetDate = monthsAgo === 0 ? new Date() : subMonths(new Date(), monthsAgo);
    return { from: startOfMonth(targetDate), to: endOfMonth(targetDate) };
  }
  const now = new Date();
  return { from: startOfMonth(now), to: endOfMonth(now) };
}

export const getFilesInDateRange = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(dateRangeSchema)
  .handler(async ({ data, context }) => {
    const range = resolveDateRange(data);
    const files = await listOwnedFilesInRange({ ownerId: userIdFromCtx(context), from: range.from, to: range.to });

    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      files,
    };
  });
