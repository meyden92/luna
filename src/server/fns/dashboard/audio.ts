import { createServerFn } from '@tanstack/react-start';
import { userIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

export const listMyAudioFiles = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .handler(async ({ context }) => {
    const { default: prisma } = await import('@/libs/prismadb');
    const cdn = import.meta.env.VITE_PUBLIC_CDN_URL;
    const userId = userIdFromCtx(context);

    const files = await prisma.file.findMany({
      where: {
        ownerId: userId,
        contentType: { in: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp3'] },
      },
      select: { id: true, title: true, url: true },
    });

    return files.map((file) => ({ ...file, url: `${cdn}/${userId}/${file.url}` })).filter((file) => !file.url.includes('tts'));
  });
