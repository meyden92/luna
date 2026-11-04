import { getStudioModel, listStudioModels, recordStudioSchemaCheck, type StudioModel } from '@/db/queries/studio';
import { throwIfAborted } from '@/libs/abort';
import { falClient } from './config';
import { resolveOpenapiSchemas } from './openapi';
import { diffInputSchemas, isEmptyDiff } from './schema-diff';

/**
 * The schema drift check: compares Models' snapshots with fal's current
 * schemas and records a differing one as the pending schema, and fal's
 * deprecation. Never changes a Model's snapshot or Field configs. Server-only;
 * run daily by the `check-studio-schemas` task and for one Model by *Check now*.
 */

/** fal's Platform API takes at most this many endpoint ids per call. */
const ENDPOINTS_PER_CALL = 50;

export interface SchemaCheckResult {
  checked: number;
  /** Models whose fal schema differs from their snapshot. */
  drifted: number;
  deprecated: number;
  /** Endpoints fal no longer lists; their Models are left as they are. */
  missing: string[];
  /** Endpoints whose OpenAPI document could not be read. */
  failed: { endpointId: string; message: string }[];
}

export async function checkStudioSchemas({ modelIds, signal }: { modelIds?: string[]; signal?: AbortSignal } = {}) {
  const models: StudioModel[] = modelIds
    ? (await Promise.all(modelIds.map((id) => getStudioModel(id)))).filter((model) => model !== undefined)
    : await listStudioModels();
  const byEndpoint = Map.groupBy(models, (model) => model.endpointId);
  const endpointIds = [...byEndpoint.keys()];
  const result: SchemaCheckResult = { checked: 0, drifted: 0, deprecated: 0, missing: [], failed: [] };

  for (let start = 0; start < endpointIds.length; start += ENDPOINTS_PER_CALL) {
    throwIfAborted(signal);
    const batch = endpointIds.slice(start, start + ENDPOINTS_PER_CALL);
    const page = await falClient().platform.models({ endpointIds: batch, expandOpenapi: true, limit: batch.length });
    const found = new Map(page.models.map((model) => [model.endpointId, model]));

    for (const endpointId of batch) {
      const current = found.get(endpointId);
      if (!current?.openapi) {
        result.missing.push(endpointId);
        continue;
      }
      let schema: ReturnType<typeof resolveOpenapiSchemas>;
      try {
        schema = resolveOpenapiSchemas(current.openapi, endpointId);
      } catch (error) {
        result.failed.push({ endpointId, message: error instanceof Error ? error.message : String(error) });
        continue;
      }
      const deprecated = current.status === 'deprecated';
      for (const model of byEndpoint.get(endpointId) ?? []) {
        const drifted = !isEmptyDiff(diffInputSchemas(model.schemaSnapshot.input, schema.input));
        await recordStudioSchemaCheck(model.id, { pendingSchema: drifted ? schema : null, deprecated, checkedAt: new Date() });
        result.checked += 1;
        if (drifted) result.drifted += 1;
        if (deprecated) result.deprecated += 1;
      }
    }
  }
  return result;
}
