import prisma from '@/libs/prismadb';

// Resolves a raw API token key to its enabled token record and owning user.
// Single source of truth for token auth — used by both tokenMiddleware and
// raw route handlers (e.g. the ShareX upload endpoint) that can't use
// TanStack middleware.
export function validateTokenKey(key: string) {
  return prisma.token.findFirst({
    where: {
      key,
      enabled: true,
      user: {
        isDeleted: false,
        OR: [{ banned: null }, { banned: false }, { banExpires: { lte: new Date() } }],
      },
    },
    include: { user: true },
  });
}
