import { createServerFn } from '@tanstack/react-start';
import { listOwnedAudioFiles } from '@/db/queries/delivery';
import { getCdnUrl } from '@/libs/runtime-config';
import { userIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

export const listMyAudioFiles = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .handler(async ({ context }) => {
    const cdn = getCdnUrl();
    const userId = userIdFromCtx(context);

    const files = await listOwnedAudioFiles(userId);

    return files.map((file) => ({ ...file, url: `${cdn}/${userId}/${file.url}` })).filter((file) => !file.url.includes('tts'));
  });
