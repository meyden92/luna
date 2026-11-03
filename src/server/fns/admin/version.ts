import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { fetchLatestRelease, isNewerVersion } from '@/libs/app-version';
import { env } from '@/libs/env';
import { appMiddleware } from '@/server/server-fn';

/**
 * The release this instance runs (null in dev builds), its commit, and the latest GitHub release (null when the check failed).
 * `force` asks GitHub again instead of answering from the cache.
 */
export const getVersionInfo = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(z.object({ force: z.boolean() }).optional())
  .handler(async ({ data }) => {
    const version = env.BUILD_VERSION || null;
    const latest = await fetchLatestRelease(data?.force).catch((error: unknown) => {
      console.error('[Version] Latest release check failed:', error);
      return null;
    });

    return {
      version,
      commit: env.BUILD_COMMIT ?? 'unknown',
      latest,
      updateAvailable: version !== null && latest !== null && isNewerVersion(latest.version, version),
    };
  });
