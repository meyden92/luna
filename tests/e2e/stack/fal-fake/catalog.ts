/**
 * The fake fal service's fixed catalog: each Model's metadata, OpenAPI input
 * and output schemas, unit price and canned result. Shared by `server.ts` and
 * the specs, so a spec can name endpoints and read schemas without literals.
 * Pure: no Bun APIs, no I/O.
 */

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

export interface FakeModel {
  endpointId: string;
  displayName: string;
  category: string;
  description: string;
  /** The OpenAPI component names, as fal names them: `<Name>Input` and `<Name>Output`. */
  schemaName: string;
  input: JsonObject;
  output: JsonObject;
  /** Extra components the schemas `$ref`. */
  components: Record<string, JsonObject>;
  price: { unit: string; unitPrice: number };
  /** The units a request is billed for, from its input. */
  units: (input: JsonObject) => number;
  result: (input: JsonObject, media: MediaUrls) => JsonObject;
}

/** The fixture files a result points at, served by the fake under `/media/`. */
export const MEDIA = {
  image: { name: 'icon-small.png', contentType: 'image/png', width: 128, height: 128 },
  video: { name: 'clip.mp4', contentType: 'video/mp4', width: 320, height: 240 },
  audio: { name: 'tone.mp3', contentType: 'audio/mpeg' },
  model3d: { name: 'triangle.glb', contentType: 'model/gltf-binary' },
} as const;

export type MediaUrls = Record<keyof typeof MEDIA, string>;

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const prompt = { title: 'Prompt', type: 'string', description: 'What to generate.' };

const fileComponents: Record<string, JsonObject> = {
  Image: {
    title: 'Image',
    type: 'object',
    properties: {
      url: { title: 'Url', type: 'string' },
      content_type: { title: 'Content Type', type: 'string' },
      width: { title: 'Width', type: 'integer' },
      height: { title: 'Height', type: 'integer' },
    },
    required: ['url'],
  },
  File: {
    title: 'File',
    type: 'object',
    properties: {
      url: { title: 'Url', type: 'string' },
      content_type: { title: 'Content Type', type: 'string' },
      file_name: { title: 'File Name', type: 'string' },
    },
    required: ['url'],
  },
};

/** A text-to-image input: an enum behind a `$ref`, an output count, and an `anyOf` nullable seed. */
function textToImageInput(): JsonObject {
  return {
    title: 'TextToImageInput',
    type: 'object',
    properties: {
      prompt,
      aspect_ratio: { ...ref('AspectRatio'), title: 'Aspect Ratio', default: '1:1' },
      num_images: { title: 'Num Images', type: 'integer', minimum: 1, maximum: 4, default: 1 },
      seed: { anyOf: [{ type: 'integer' }, { type: 'null' }], title: 'Seed', description: 'The same seed gives the same image.' },
    },
    'x-fal-order-properties': ['prompt', 'aspect_ratio', 'num_images', 'seed'],
    required: ['prompt'],
  };
}

const imageComponents: Record<string, JsonObject> = {
  ...fileComponents,
  AspectRatio: { title: 'AspectRatio', type: 'string', enum: ['1:1', '16:9', '9:16', '4:3', '3:4'] },
};

function imagesResult(count: number, media: MediaUrls): JsonObject {
  const { contentType, width, height } = MEDIA.image;
  return { images: Array.from({ length: count }, () => ({ url: media.image, content_type: contentType, width, height })) };
}

function imageCount(input: JsonObject): number {
  return typeof input.num_images === 'number' ? Math.min(Math.max(Math.trunc(input.num_images), 1), 4) : 1;
}

const textToImage = (endpointId: string, displayName: string, schemaName: string): FakeModel => ({
  endpointId,
  displayName,
  category: 'text-to-image',
  description: `${displayName}: text to image, served by the E2E fake.`,
  schemaName,
  input: textToImageInput(),
  output: {
    title: `${schemaName}Output`,
    type: 'object',
    properties: { images: { title: 'Images', type: 'array', items: ref('Image') }, seed: { title: 'Seed', type: 'integer' } },
    required: ['images', 'seed'],
  },
  components: imageComponents,
  price: { unit: 'image', unitPrice: 0.03 },
  units: imageCount,
  result: (input, media) => ({ ...imagesResult(imageCount(input), media), seed: typeof input.seed === 'number' ? input.seed : 42 }),
});

export const FAKE_MODELS: readonly FakeModel[] = [
  textToImage('fake/image', 'Fake Image', 'FakeImage'),
  {
    endpointId: 'fake/edit',
    displayName: 'Fake Edit',
    category: 'image-to-image',
    description: 'Fake Edit: edits images from a prompt, served by the E2E fake.',
    schemaName: 'FakeEdit',
    input: {
      title: 'EditInput',
      type: 'object',
      properties: {
        prompt,
        image_urls: { title: 'Image Urls', type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 4 },
      },
      'x-fal-order-properties': ['prompt', 'image_urls'],
      required: ['prompt', 'image_urls'],
    },
    output: {
      title: 'EditOutput',
      type: 'object',
      properties: { images: { title: 'Images', type: 'array', items: ref('Image') } },
      required: ['images'],
    },
    components: fileComponents,
    price: { unit: 'image', unitPrice: 0.04 },
    units: () => 1,
    result: (_input, media) => imagesResult(1, media),
  },
  {
    endpointId: 'fake/video',
    displayName: 'Fake Video',
    category: 'image-to-video',
    description: 'Fake Video: animates an image, served by the E2E fake.',
    schemaName: 'FakeVideo',
    input: {
      title: 'VideoInput',
      type: 'object',
      properties: {
        prompt,
        image_url: { title: 'Image Url', type: 'string' },
        duration: { title: 'Duration', type: 'integer', minimum: 5, maximum: 10, default: 5, description: 'Seconds.' },
      },
      'x-fal-order-properties': ['prompt', 'image_url', 'duration'],
      required: ['prompt', 'image_url'],
    },
    output: { title: 'VideoOutput', type: 'object', properties: { video: ref('File') }, required: ['video'] },
    components: fileComponents,
    price: { unit: 'second', unitPrice: 0.1 },
    units: (input) => (typeof input.duration === 'number' ? input.duration : 5),
    result: (_input, media) => ({ video: { url: media.video, content_type: MEDIA.video.contentType, file_name: MEDIA.video.name } }),
  },
  {
    endpointId: 'fake/audio',
    displayName: 'Fake Audio',
    category: 'text-to-audio',
    description: 'Fake Audio: text to sound, served by the E2E fake.',
    schemaName: 'FakeAudio',
    input: { title: 'AudioInput', type: 'object', properties: { prompt }, 'x-fal-order-properties': ['prompt'], required: ['prompt'] },
    output: { title: 'AudioOutput', type: 'object', properties: { audio: ref('File') }, required: ['audio'] },
    components: fileComponents,
    price: { unit: 'request', unitPrice: 0.02 },
    units: () => 1,
    result: (_input, media) => ({ audio: { url: media.audio, content_type: MEDIA.audio.contentType, file_name: MEDIA.audio.name } }),
  },
  {
    endpointId: 'fake/3d',
    displayName: 'Fake 3D',
    category: 'image-to-3d',
    description: 'Fake 3D: turns an image into a mesh, served by the E2E fake.',
    schemaName: 'Fake3d',
    input: {
      title: 'MeshInput',
      type: 'object',
      properties: { image_url: { title: 'Image Url', type: 'string' } },
      'x-fal-order-properties': ['image_url'],
      required: ['image_url'],
    },
    output: { title: 'MeshOutput', type: 'object', properties: { model_mesh: ref('File') }, required: ['model_mesh'] },
    components: fileComponents,
    price: { unit: 'request', unitPrice: 0.25 },
    units: () => 1,
    result: (_input, media) => ({
      model_mesh: { url: media.model3d, content_type: MEDIA.model3d.contentType, file_name: MEDIA.model3d.name },
    }),
  },
  // Text output: the Studio must never offer it.
  {
    endpointId: 'fake/llm',
    displayName: 'Fake LLM',
    category: 'llm',
    description: 'Fake LLM: answers with text, served by the E2E fake.',
    schemaName: 'FakeLlm',
    input: { title: 'ChatInput', type: 'object', properties: { prompt }, 'x-fal-order-properties': ['prompt'], required: ['prompt'] },
    output: { title: 'ChatOutput', type: 'object', properties: { output: { title: 'Output', type: 'string' } }, required: ['output'] },
    components: {},
    price: { unit: 'request', unitPrice: 0.001 },
    units: () => 1,
    result: (input) => ({ output: `Fake answer to: ${String(input.prompt ?? '')}` }),
  },
  // Reserved for specs that swap its schema through `/__control/schema`: the fake
  // is shared by every worker, so no other spec may use this endpoint.
  textToImage('fake/drift', 'Fake Drift', 'FakeDrift'),
];

export function fakeModel(endpointId: string): FakeModel | undefined {
  return FAKE_MODELS.find((model) => model.endpointId === endpointId);
}

/** fal's per-endpoint OpenAPI 3.0 document, in the shape `GET /v1/models?expand=openapi-3.0` returns. */
export function openapiDocument(model: FakeModel, input: JsonObject): JsonObject {
  const { endpointId, schemaName } = model;
  const schema = (name: string) => ({ 'application/json': { schema: ref(name) } });
  return {
    openapi: '3.0.4',
    info: {
      title: `Queue OpenAPI for ${endpointId}`,
      version: '1.0.0',
      'x-fal-metadata': { endpointId, category: model.category },
    },
    components: {
      securitySchemes: { apiKeyAuth: { type: 'apiKey', in: 'header', name: 'Authorization', description: 'Fal Key' } },
      schemas: { ...model.components, [`${schemaName}Input`]: input, [`${schemaName}Output`]: model.output },
    },
    paths: {
      [`/${endpointId}`]: {
        post: { requestBody: { required: true, content: schema(`${schemaName}Input`) }, responses: { '200': { description: 'Queued.' } } },
      },
      [`/${endpointId}/requests/{request_id}`]: {
        get: { responses: { '200': { description: 'Result of the request.', content: schema(`${schemaName}Output`) } } },
      },
    },
    servers: [{ url: 'https://queue.fal.run' }],
    security: [{ apiKeyAuth: [] }],
  };
}
