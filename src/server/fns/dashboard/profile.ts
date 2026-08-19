import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { z } from 'zod';
import { RATE_LIMITS } from '@/libs/api/rate-limit';
import { appMiddleware } from '@/server/server-fn';

const idSchema = z.object({ id: z.string().min(1) });

export const getProfileById = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'none', rateLimit: RATE_LIMITS.publicProfileView }))
  .validator(idSchema)
  .handler(async ({ data }) => {
    const { getPublicProfile } = await import('@/db/queries/auth');
    const profile = await getPublicProfile(data.id);
    if (!profile) return null;
    const { fileCount, ...user } = profile;

    if (!user.isProfilePublic) {
      const [{ getOptionalAuthenticatedUser }, { isUserAdmin }] = await Promise.all([
        import('@/libs/rbac/guards'),
        import('@/libs/rbac/service'),
      ]);
      const viewerId = (await getOptionalAuthenticatedUser(getRequestHeaders()))?.id;
      const canView = viewerId === user.id || (viewerId ? await isUserAdmin(viewerId) : false);
      if (!canView) return null;
    }

    // The profile page reads `_count.File`, so Prisma's count shape is kept.
    return { ...user, _count: { File: fileCount } };
  });
