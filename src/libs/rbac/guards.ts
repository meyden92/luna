import { getRequestHeaders } from '@tanstack/react-start/server';
import { auth } from '@/libs/auth/auth';
import prisma from '@/libs/prismadb';
import { ForbiddenError, UnauthorizedError } from './errors';
import { isUserAdmin } from './service';

export { ForbiddenError, UnauthorizedError };

export async function requireAuthenticatedUser(requestHeaders?: Headers) {
  const session = await auth.api.getSession({
    headers: requestHeaders ?? getRequestHeaders(),
    query: { disableCookieCache: true },
  });

  if (!session?.user?.id) {
    throw new UnauthorizedError();
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isDeleted: true, banned: true, banExpires: true },
  });
  const bannedNow = user?.banned === true && (user.banExpires === null || user.banExpires > new Date());
  if (!user || user.isDeleted || bannedNow) {
    throw new UnauthorizedError();
  }

  return session.user;
}

export async function getOptionalAuthenticatedUser(requestHeaders?: Headers) {
  try {
    return await requireAuthenticatedUser(requestHeaders);
  } catch (error) {
    if (error instanceof UnauthorizedError) return null;
    throw error;
  }
}

export async function requireAdmin(requestHeaders?: Headers) {
  const user = await requireAuthenticatedUser(requestHeaders);
  const allowed = await isUserAdmin(user.id);

  if (!allowed) {
    throw new ForbiddenError();
  }

  return user;
}

export async function requireAdminForUserId(userId: string) {
  const allowed = await isUserAdmin(userId);

  if (!allowed) {
    throw new ForbiddenError();
  }
}
