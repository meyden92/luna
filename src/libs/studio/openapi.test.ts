import { describe, expect, test } from 'bun:test';
import type { JsonValue } from '@/db/schema/json';
import { resolveOpenapiSchemas } from './openapi';

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

/** The shape fal's `GET /v1/models?expand=openapi-3.0` returns per endpoint. */
function document(endpointId: string, schemas: Record<string, JsonValue>): JsonValue {
  const content = (name: string) => ({ 'application/json': { schema: ref(name) } });
  return {
    openapi: '3.0.4',
    components: { schemas },
    paths: {
      [`/${endpointId}`]: { post: { requestBody: { content: content('FluxInput') } } },
      [`/${endpointId}/requests/{request_id}`]: { get: { responses: { '200': { content: content('FluxOutput') } } } },
    },
  };
}

describe('resolveOpenapiSchemas', () => {
  test('follows the endpoint paths to the input and output schemas and inlines their $refs', () => {
    const snapshot = resolveOpenapiSchemas(
      document('fal-ai/flux', {
        AspectRatio: { title: 'AspectRatio', type: 'string', enum: ['1:1', '16:9'] },
        Image: { type: 'object', properties: { url: { type: 'string' } } },
        FluxInput: {
          type: 'object',
          properties: { prompt: { type: 'string' }, aspect_ratio: { ...ref('AspectRatio'), title: 'Aspect Ratio', default: '1:1' } },
          required: ['prompt'],
        },
        FluxOutput: { type: 'object', properties: { images: { type: 'array', items: ref('Image') } } },
      }),
      'fal-ai/flux',
    );

    expect(snapshot.input.properties?.aspect_ratio).toEqual({
      title: 'Aspect Ratio',
      type: 'string',
      enum: ['1:1', '16:9'],
      default: '1:1',
    });
    expect(snapshot.input.required).toEqual(['prompt']);
    expect(snapshot.output.properties?.images?.items).toEqual({ type: 'object', properties: { url: { type: 'string' } } });
  });

  test('collapses a nullable anyOf into its one non-null branch, keeping the outer title and default', () => {
    const snapshot = resolveOpenapiSchemas(
      document('fal-ai/flux', {
        FluxInput: {
          type: 'object',
          properties: { seed: { anyOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }], title: 'Seed' } },
        },
        FluxOutput: { type: 'object' },
      }),
      'fal-ai/flux',
    );

    expect(snapshot.input.properties?.seed).toEqual({ type: 'integer', minimum: 0, title: 'Seed' });
  });

  test('keeps a real anyOf of several branches, resolved', () => {
    const snapshot = resolveOpenapiSchemas(
      document('fal-ai/flux', {
        ImageSize: { type: 'object', properties: { width: { type: 'integer' } } },
        FluxInput: {
          type: 'object',
          properties: { image_size: { anyOf: [ref('ImageSize'), { type: 'string', enum: ['square_hd'] }], default: 'square_hd' } },
        },
        FluxOutput: { type: 'object' },
      }),
      'fal-ai/flux',
    );

    expect(snapshot.input.properties?.image_size).toEqual({
      anyOf: [
        { type: 'object', properties: { width: { type: 'integer' } } },
        { type: 'string', enum: ['square_hd'] },
      ],
      default: 'square_hd',
    });
  });

  test('merges a single-$ref allOf into the property', () => {
    const snapshot = resolveOpenapiSchemas(
      document('fal-ai/flux', {
        Quality: { type: 'string', enum: ['low', 'high'] },
        FluxInput: { type: 'object', properties: { quality: { allOf: [ref('Quality')], description: 'How good.' } } },
        FluxOutput: { type: 'object' },
      }),
      'fal-ai/flux',
    );

    expect(snapshot.input.properties?.quality).toEqual({ type: 'string', enum: ['low', 'high'], description: 'How good.' });
  });

  test('stops at a recursive $ref instead of looping', () => {
    const snapshot = resolveOpenapiSchemas(
      document('fal-ai/flux', {
        Node: { type: 'object', properties: { child: ref('Node') } },
        FluxInput: { type: 'object', properties: { tree: ref('Node') } },
        FluxOutput: { type: 'object' },
      }),
      'fal-ai/flux',
    );

    expect(snapshot.input.properties?.tree?.properties?.child).toEqual({ type: 'object' });
  });

  test('reads an aliased endpoint whose paths are documented under the app it aliases', () => {
    const snapshot = resolveOpenapiSchemas(
      document('fal-ai/gpt-image-2', {
        FluxInput: { type: 'object', properties: { prompt: { type: 'string' } } },
        FluxOutput: { type: 'object' },
      }),
      'openai/gpt-image-2',
    );

    expect(snapshot.input.properties?.prompt).toEqual({ type: 'string' });
  });

  test('refuses a document without the endpoint input schema', () => {
    expect(() => resolveOpenapiSchemas({ openapi: '3.0.4', components: { schemas: {} }, paths: {} }, 'fal-ai/flux')).toThrow('fal-ai/flux');
  });
});
