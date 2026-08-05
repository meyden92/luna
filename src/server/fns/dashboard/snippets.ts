import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { z } from 'zod';
import { RATE_LIMITS } from '@/libs/api/rate-limit';
import { userIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

const idSchema = z.object({ id: z.string().min(1) });

export const getSnippetById = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'none', rateLimit: RATE_LIMITS.publicSnippetView }))
  .validator(idSchema)
  .handler(async ({ data }) => {
    const { default: prisma } = await import('@/libs/prismadb');
    const snippet = await prisma.snippet.findFirst({
      where: { id: data.id, isDeleted: false },
      include: { author: { select: { id: true, name: true, image: true } } },
    });
    if (!snippet) {
      return { status: 'not-found', snippet: null, viewerCanAccess: false, viewerIsOwner: false } as const;
    }

    const [{ getOptionalAuthenticatedUser }, { isUserAdmin }] = await Promise.all([
      import('@/libs/rbac/guards'),
      import('@/libs/rbac/service'),
    ]);
    const viewerId = (await getOptionalAuthenticatedUser(getRequestHeaders()))?.id;
    const viewerIsOwner = viewerId === snippet.ownerId;
    const viewerCanAccess = snippet.isPublic || viewerIsOwner || (viewerId ? await isUserAdmin(viewerId) : false);

    if (!viewerCanAccess) {
      return { status: 'private', snippet: null, viewerCanAccess: false, viewerIsOwner: false } as const;
    }

    return { status: 'ok', snippet, viewerCanAccess: true, viewerIsOwner } as const;
  });

export const listMySnippets = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .handler(async ({ context }) => {
    const { default: prisma } = await import('@/libs/prismadb');
    return prisma.snippet.findMany({
      where: { ownerId: userIdFromCtx(context), isDeleted: false },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        content: true,
        language: true,
        isPublic: true,
        createdAt: true,
      },
    });
  });
