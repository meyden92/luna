import { throwIfAborted } from '@/libs/abort';
import { isStudioEnabled } from '@/libs/studio/config';
import { checkStudioSchemas } from '@/libs/studio/schema-check';
import type { TaskFunction } from '@/types/tasks';

/** Records, for every Studio Model, whether fal's schema drifted from its snapshot and whether fal deprecated it. */
export const checkStudioSchemasExecutor: TaskFunction = async (...args) => {
  const { signal } = args[args.length - 1];
  throwIfAborted(signal);
  if (!isStudioEnabled()) return { summary: 'The Studio is off', details: { checked: 0 } };

  const result = await checkStudioSchemas({ signal });
  return {
    summary:
      result.drifted > 0
        ? `fal changed the schema of ${result.drifted} of ${result.checked} Studio Models`
        : `Checked ${result.checked} Studio Models: no schema changes`,
    details: { ...result, executedAt: new Date().toISOString() },
  };
};
