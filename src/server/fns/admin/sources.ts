import { createServerFn } from '@tanstack/react-start';
import { deleteSourceSession, listSourceSessionStates, upsertSourceSession } from '@/db/queries/source-sessions';
import { getTaskByName } from '@/db/queries/tasks';
import { cookiesProblem } from '@/libs/downloads/cookies';
import { type Source, sources } from '@/libs/downloads/sources';
import { ytDlpVersion } from '@/libs/downloads/yt-dlp';
import { encryptFieldValue } from '@/libs/encryption/field-encryption';
import { UPDATE_YT_DLP_TASK_NAME } from '@/libs/tasks/init';
import { UserFacingError } from '@/libs/user-facing-error';
import { setSourceSessionSchema, sourceKeySchema } from '@/schemas/admin/source-schema';
import { userIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

// The Sources admin page's server fns. A Source session goes in encrypted and
// never comes back out: nothing here returns its value.

function sourceFor(sourceKey: string): Source {
  const source = sources.get(sourceKey);
  if (!source) throw new UserFacingError(`Unknown Source ${sourceKey}`);
  return source;
}

/** Every registered Source with whether its Source session is set, plus the installed yt-dlp and its latest update run. */
export const listSources = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .handler(async () => {
    const [states, version, updateTask] = await Promise.all([
      listSourceSessionStates(),
      // Null when yt-dlp can't be run.
      ytDlpVersion().catch(() => null),
      getTaskByName(UPDATE_YT_DLP_TASK_NAME),
    ]);
    const updatedAt = new Map(states.map((state) => [state.sourceKey, state.updatedAt]));
    const lastRun = updateTask?.executions[0];
    const result = lastRun?.result as { summary?: unknown } | null | undefined;

    return {
      sources: [...sources.values()].map(({ key, label }) => ({
        key,
        label,
        sessionSet: updatedAt.has(key),
        sessionUpdatedAt: updatedAt.get(key) ?? null,
      })),
      ytDlpVersion: version,
      lastUpdateRun: lastRun
        ? {
            startedAt: lastRun.startedAt,
            status: lastRun.status,
            summary: typeof result?.summary === 'string' ? result.summary : (lastRun.error ?? null),
          }
        : null,
    };
  });

/** Sets or replaces a Source's Source session from a Netscape cookies.txt. */
export const setSourceSession = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(setSourceSessionSchema)
  .handler(async ({ data, context }) => {
    const source = sourceFor(data.sourceKey);
    const problem = cookiesProblem(data.cookies, source.cookieDomain);
    if (problem) throw new UserFacingError(problem);

    await upsertSourceSession({ sourceKey: source.key, encryptedValue: encryptFieldValue(data.cookies) }, userIdFromCtx(context));
    return { success: true };
  });

/** Clears a Source's Source session, so its Downloads run logged out. */
export const clearSourceSession = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(sourceKeySchema)
  .handler(async ({ data, context }) => {
    const source = sourceFor(data.sourceKey);
    await deleteSourceSession(source.key, userIdFromCtx(context));
    return { success: true };
  });
