import { createServerFn } from '@tanstack/react-start';
import { fetchLatestRelease, isNewerVersion } from '@/libs/app-version';
import { env } from '@/libs/env';
import { appMiddleware } from '@/server/server-fn';

/** The release this instance runs (null in dev builds), its commit, and the latest GitHub release (null when the check failed). */
export const getVersionInfo = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .handler(async () => {
    const version = env.BUILD_VERSION || null;
    const latest = await fetchLatestRelease().catch((error: unknown) => {
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
