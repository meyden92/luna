import type { modelField } from '@/db/schema/ai';

/**
 * The Create tab offers five plain-language controls — shape, count, quality,
 * detail steps and seed — instead of the model's raw parameter list. A model's
 * parameters are admin-configured rows, so each control is matched to a field by
 * name and simply does not appear in the request when the model has no such
 * field. Everything the UI does not expose keeps the model's own default.
 */
type ModelFieldRow = Pick<typeof modelField.$inferSelect, 'name' | 'type' | 'defaultValue' | 'minValue' | 'maxValue'>;

/** A generation or editing model as `listAiModels` returns it. */
export interface GenerationModel {
  id: string;
  label: string;
  description: string | null;
  apiModelName: string;
  fields: ModelFieldRow[];
}

/** Field names a control will drive, most specific first. */
const FIELD_ALIASES = {
  prompt: ['prompt'],
  width: ['width'],
  height: ['height'],
  aspectRatio: ['aspect_ratio', 'aspectRatio'],
  steps: ['num_inference_steps', 'steps'],
  seed: ['seed'],
  count: ['num_outputs', 'num_images', 'num_images_per_prompt'],
} as const;

type ControlName = keyof typeof FIELD_ALIASES;

function findField(fields: ModelFieldRow[], control: ControlName): ModelFieldRow | undefined {
  for (const alias of FIELD_ALIASES[control]) {
    const match = fields.find((field) => field.name === alias);
    if (match) return match;
  }
  return undefined;
}

export interface Shape {
  value: string;
  /** width / height, used for the drawn aspect box and the result grid. */
  ratio: number;
  width: number;
  height: number;
  /** Native tooltip on the segmented option. */
  pixels: string;
}

export const SHAPES: readonly Shape[] = [
  { value: '1:1', ratio: 1, width: 1024, height: 1024, pixels: '1024 × 1024' },
  { value: '3:4', ratio: 0.75, width: 896, height: 1152, pixels: '896 × 1152' },
  { value: '4:3', ratio: 1152 / 896, width: 1152, height: 896, pixels: '1152 × 896' },
  { value: '16:9', ratio: 1344 / 768, width: 1344, height: 768, pixels: '1344 × 768' },
  { value: '9:16', ratio: 768 / 1344, width: 768, height: 1344, pixels: '768 × 1344' },
];

export const DEFAULT_SHAPE = '1:1';

export function findShape(value: string): Shape {
  return SHAPES.find((shape) => shape.value === value) ?? SHAPES[0]!;
}

export type Quality = 'fast' | 'balanced' | 'best';

export const QUALITIES: ReadonlyArray<{ value: Quality; label: string; steps: number }> = [
  { value: 'fast', label: 'Fast', steps: 4 },
  { value: 'balanced', label: 'Balanced', steps: 8 },
  { value: 'best', label: 'Best', steps: 16 },
];

export const DEFAULT_STEPS = 8;

/** The quality whose step count matches, or null when the slider has moved off all three. */
export function qualityForSteps(steps: number): Quality | null {
  return QUALITIES.find((quality) => quality.steps === steps)?.value ?? null;
}

export function qualityLabel(steps: number): string {
  const quality = qualityForSteps(steps);
  return quality ? QUALITIES.find((q) => q.value === quality)!.label : 'Custom';
}

export const COUNTS = [1, 2, 4] as const;

/**
 * The count option a run should start on for a source that declares its own
 * bounds. Templates store `minImageCount`/`maxImageCount` as free numbers, so a
 * template asking for 3 matches no option at all: seeding 3 would leave the
 * segmented control with no active option and nothing for the unmeasured
 * fallback to style, while still submitting 3. This lands on the smallest option
 * that satisfies the minimum without exceeding the maximum.
 */
export function startingCount(min: number, max: number): number {
  const allowed = COUNTS.filter((value) => value <= max);
  return allowed.find((value) => value >= min) ?? allowed.at(-1) ?? COUNTS[0];
}

/**
 * How many images one run of this model can return. Models without a count
 * field produce a single image, which is why the higher count options are
 * disabled rather than silently ignored.
 */
export function maxImagesPerRun(fields: ModelFieldRow[]): number {
  const field = findField(fields, 'count');
  if (!field) return 1;
  const max = Number(field.maxValue);
  return Number.isFinite(max) && max >= 1 ? Math.floor(max) : 4;
}

export interface GenerationInputValues {
  prompt: string;
  shape: string;
  count: number;
  steps: number;
  seed: string;
}

/**
 * The request body for `/api/generate/image/stream`: the model's own defaults,
 * then the five values the Create tab owns written onto whichever fields the
 * model declares for them.
 */
export function buildGenerationInput(fields: ModelFieldRow[], defaults: Record<string, unknown>, settings: GenerationInputValues) {
  const input: Record<string, unknown> = { ...defaults };

  const set = (control: ControlName, value: unknown) => {
    const field = findField(fields, control);
    if (field) input[field.name] = value;
  };

  set('prompt', settings.prompt);

  const shape = findShape(settings.shape);
  set('width', shape.width);
  set('height', shape.height);
  set('aspectRatio', shape.value);

  set('count', settings.count);
  set('steps', settings.steps);

  const seed = Number(settings.seed);
  if (settings.seed.trim() !== '' && Number.isFinite(seed)) set('seed', seed);

  return input;
}

/** Reads the shape back out of a finished run so its metadata line and grid match. */
export function shapeFromFieldValues(fieldValues: Record<string, unknown> | undefined): Shape {
  if (!fieldValues) return findShape(DEFAULT_SHAPE);

  const aspect = fieldValues.aspect_ratio ?? fieldValues.aspectRatio;
  if (typeof aspect === 'string') {
    const match = SHAPES.find((shape) => shape.value === aspect);
    if (match) return match;
  }

  const width = Number(fieldValues.width);
  const height = Number(fieldValues.height);
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    const match = SHAPES.find((shape) => shape.width === width && shape.height === height);
    if (match) return match;
    return { value: `${width}:${height}`, ratio: width / height, width, height, pixels: `${width} × ${height}` };
  }

  return findShape(DEFAULT_SHAPE);
}

/** Steps actually used by a finished run, for its "z-image · 1:1 · Balanced" line. */
export function stepsFromFieldValues(fieldValues: Record<string, unknown> | undefined): number | null {
  for (const alias of FIELD_ALIASES.steps) {
    const value = Number(fieldValues?.[alias]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

/** How many images a recorded run asked for, so its tiles can be laid out before they arrive. */
export function countFromFieldValues(fieldValues: Record<string, unknown> | undefined): number {
  for (const alias of FIELD_ALIASES.count) {
    const value = Number(fieldValues?.[alias]);
    if (Number.isFinite(value) && value >= 1) return Math.floor(value);
  }
  return 1;
}

/** Prompt text out of a finished run's recorded field values. */
export function promptFromFieldValues(fieldValues: Record<string, unknown> | undefined, fallback = ''): string {
  const value = fieldValues?.prompt;
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

/** The Create values a saved preset restores. A value the preset does not hold is absent. */
export interface PresetValues {
  shape?: string;
  count?: number;
  steps?: number;
  /** Always set: a preset saved without a seed means a random one. */
  seed: string;
}

/**
 * The field values a preset stores: only what the Create tab controls, written
 * onto this model's fields. The model's own defaults are left out so applying a
 * preset never turns a default seed into a fixed one.
 */
export function presetFieldValues(fields: ModelFieldRow[], settings: Omit<GenerationInputValues, 'prompt'>): Record<string, unknown> {
  const { prompt: _prompt, ...values } = buildGenerationInput(fields, {}, { ...settings, prompt: '' });
  return values;
}

/** Reads a saved preset's field values back into the Create controls they came from. */
export function presetValuesFromFieldValues(fieldValues: Record<string, unknown>): PresetValues {
  const hasShape =
    typeof (fieldValues.aspect_ratio ?? fieldValues.aspectRatio) === 'string' ||
    (fieldValues.width !== undefined && fieldValues.height !== undefined);
  const shape = hasShape ? shapeFromFieldValues(fieldValues).value : undefined;
  const count = FIELD_ALIASES.count.some((alias) => fieldValues[alias] !== undefined) ? countFromFieldValues(fieldValues) : undefined;
  const seed = Number(fieldValues.seed);

  return {
    shape: SHAPES.some((entry) => entry.value === shape) ? shape : undefined,
    count: COUNTS.find((value) => value === count),
    steps: stepsFromFieldValues(fieldValues) ?? undefined,
    seed: fieldValues.seed !== undefined && fieldValues.seed !== null && Number.isFinite(seed) ? String(seed) : '',
  };
}
