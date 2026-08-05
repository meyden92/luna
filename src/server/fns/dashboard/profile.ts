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
    const { default: prisma } = await import('@/libs/prismadb');
    const user = await prisma.user.findUnique({
      where: { id: data.id },
      select: {
        id: true,
        name: true,
        image: true,
        bio: true,
        description: true,
        role: true,
        isProfilePublic: true,
        _count: { select: { File: { where: { isDeleted: false } } } },
      },
    });
    if (!user) return null;

    if (!user.isProfilePublic) {
      const [{ getOptionalAuthenticatedUser }, { isUserAdmin }] = await Promise.all([
        import('@/libs/rbac/guards'),
        import('@/libs/rbac/service'),
      ]);
      const viewerId = (await getOptionalAuthenticatedUser(getRequestHeaders()))?.id;
      const canView = viewerId === user.id || (viewerId ? await isUserAdmin(viewerId) : false);
      if (!canView) return null;
    }

    return user;
  });
