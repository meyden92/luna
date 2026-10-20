import { createServerFn } from '@tanstack/react-start';
import * as registry from '@/libs/downloads/registry';
import { parsePostUrl } from '@/libs/downloads/sources';
import { UserFacingError } from '@/libs/user-facing-error';
import { createDownloadSchema, downloadIdSchema } from '@/schemas/download-schema';
import { userIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

// The Downloader's server fns. Admin-only, and every call only ever sees the
// calling User's Downloads.

export const createDownload = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(createDownloadSchema)
  .handler(async ({ data, context }) => {
    const post = parsePostUrl(data.url);
    if (!post) throw new UserFacingError('Not a supported Instagram post link');
    const download = registry.start(userIdFromCtx(context), post);
    return { id: download.id };
  });

export const listDownloads = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .handler(async ({ context }) => {
    return registry.listFor(userIdFromCtx(context));
  });

export const removeDownload = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(downloadIdSchema)
  .handler(async ({ data, context }) => {
    if (!(await registry.remove(userIdFromCtx(context), data.id))) throw new UserFacingError('Download not found');
    return { success: true };
  });
