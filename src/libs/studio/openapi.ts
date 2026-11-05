import type { JsonValue } from '@/db/schema/json';
import { isRecord } from '@/libs/is-record';
import type { JsonSchema, SchemaSnapshot } from './types';

/**
 * Turns an endpoint's OpenAPI 3.0 document from fal's Platform API into the
 * Model's `schema_snapshot`: the request body and result schemas with every
 * `$ref` inlined, single-`$ref` `allOf`s merged and nullable `anyOf`s
 * collapsed into their non-null branch. A recursive `$ref` resolves to a bare
 * `{ type: 'object' }` at its second visit. fal's `{ error }` stand-in for a
 * document it could not load throws with fal's message. Pure.
 *
 * The submit path is the document's one `post` operation, not `/${endpointId}`:
 * aliased endpoints (`openai/gpt-image-2`, `google/nano-banana-2.1`) are
 * documented under the app they alias (`/fal-ai/gpt-image-2`).
 */
export function resolveOpenapiSchemas(openapi: JsonValue, endpointId: string): SchemaSnapshot {
  const doc = asRecord(openapi);
  const falError = asRecord(doc.error);
  if (typeof falError.message === 'string') {
    throw new Error(`fal could not load the OpenAPI document for ${endpointId}: ${falError.message}`);
  }
  const schemas = asRecord(asRecord(doc.components).schemas);
  const paths = asRecord(doc.paths);
  const bodySchema = (operation: JsonValue | undefined) => asRecord(asRecord(asRecord(operation).content)['application/json']).schema;

  const submitPath = Object.keys(paths).find((path) => asRecord(paths[path]).post !== undefined);
  const submit = asRecord(asRecord(paths[submitPath ?? '']).post);
  const result = asRecord(asRecord(paths[`${submitPath}/requests/{request_id}`]).get);
  const input = bodySchema(submit.requestBody);
  const output = bodySchema(asRecord(result.responses)['200']);
  if (!input || !output) throw new Error(`fal's OpenAPI document for ${endpointId} has no input or output schema`);

  const resolve = (node: JsonValue, seen: ReadonlySet<string>): JsonValue => {
    if (Array.isArray(node)) return node.map((item) => resolve(item, seen));
    if (typeof node !== 'object' || node === null) return node;

    const { $ref, allOf, anyOf, ...rest } = node;
    let merged: Record<string, JsonValue> = {};
    if (typeof $ref === 'string') {
      const name = $ref.replace('#/components/schemas/', '');
      if (seen.has(name)) return { type: 'object' };
      merged = asRecord(resolve(schemas[name] ?? {}, new Set(seen).add(name)));
    }
    if (Array.isArray(allOf) && allOf.length === 1 && allOf[0] !== undefined) merged = asRecord(resolve(allOf[0], seen));
    else if (allOf !== undefined) rest.allOf = allOf;

    for (const [key, value] of Object.entries(rest)) merged[key] = resolve(value, seen);

    if (Array.isArray(anyOf)) {
      const branches = anyOf.map((branch) => resolve(branch, seen));
      const nonNull = branches.filter((branch) => asRecord(branch).type !== 'null');
      if (nonNull.length === 1 && branches.length === 2) return { ...asRecord(nonNull[0]), ...merged };
      merged.anyOf = branches;
    }
    return merged;
  };

  return { input: resolve(input, new Set()) as JsonSchema, output: resolve(output, new Set()) as JsonSchema };
}

function asRecord(value: JsonValue | undefined): Record<string, JsonValue> {
  return isRecord(value) ? value : {};
}
