import type { JsonValue } from '@/db/schema/json';
import { isEmpty, isFileField, type RequestIssue, sameValue, valueProblem } from './request';
import type { FieldConfig, JsonSchema, MediaKind, StudioPricing, VisibleIf } from './types';

/**
 * How a Model's Field configs start out and what makes them valid. Pure,
 * shared by the admin editor (inline issues) and the server (save refuses).
 */

export type PropertyKind = 'string' | 'enum' | 'integer' | 'number' | 'boolean' | 'file' | 'files' | 'list' | 'object';

/** What a schema property is, as the editor and the form treat it. */
export interface PropertyShape {
  kind: PropertyKind;
  /** The choices of an `enum` kind. */
  enum?: string[];
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  default?: JsonValue;
  title?: string;
  description?: string;
}

export type FieldDisplay = NonNullable<FieldConfig['display']>;

/** The displays each kind can use; the first is the one it gets by default. */
export const DISPLAYS: Record<PropertyKind, FieldDisplay[]> = {
  string: ['text', 'textarea'],
  enum: ['chips', 'select'],
  integer: ['number', 'slider'],
  number: ['number', 'slider'],
  boolean: ['switch'],
  file: ['file'],
  files: ['file'],
  list: [],
  object: [],
};

/** What a kind is called at the start of a sentence. */
export const KIND_NAMES: Record<PropertyKind, string> = {
  string: 'Text',
  enum: 'A choice',
  integer: 'A whole number',
  number: 'A number',
  boolean: 'On/off',
  file: 'A file input',
  files: 'A file input',
  list: 'A list',
  object: 'An object',
};

/** Output-count inputs, shown by default and used for per-image pricing. */
const COUNT_FIELDS = ['num_images', 'num_outputs', 'num_videos', 'num_samples'];
const SHOWN_BY_DEFAULT = new Set(['prompt', 'aspect_ratio', 'image_size', ...COUNT_FIELDS]);

/** Reads a property, through an `anyOf` (its enum branch, else its first non-null one). */
export function propertyShape(name: string, property: JsonSchema): PropertyShape {
  const branches = property.anyOf?.filter((branch) => branch.type !== 'null') ?? [];
  const branch = branches.find((candidate) => candidate.enum) ?? branches[0] ?? property;
  const type = Array.isArray(branch.type) ? branch.type.find((candidate) => candidate !== 'null') : branch.type;
  const base = {
    minimum: branch.minimum ?? branch.exclusiveMinimum,
    maximum: branch.maximum ?? branch.exclusiveMaximum,
    minItems: branch.minItems,
    maxItems: branch.maxItems,
    default: property.default ?? branch.default,
    title: property.title ?? branch.title,
    description: property.description ?? branch.description,
  };
  const strings = branch.enum?.filter((value): value is string => typeof value === 'string');
  if (strings && strings.length > 0) return { ...base, kind: 'enum', enum: strings };

  const uri = (schema: JsonSchema | undefined) => schema?.format === 'uri' || schema?.format === 'url';
  if (type === 'string') return { ...base, kind: /_url$/.test(name) || uri(branch) ? 'file' : 'string' };
  if (type === 'array') {
    const items = branch.items;
    return { ...base, kind: items?.type === 'string' && (/_urls$/.test(name) || uri(items)) ? 'files' : 'list' };
  }
  if (type === 'integer' || type === 'number' || type === 'boolean' || type === 'object') return { ...base, kind: type };
  return { ...base, kind: 'object' };
}

/** Whether an input of this kind can be a file input: text and lists can, as can those detected as one. */
export function canTakeFiles(kind: PropertyKind): boolean {
  return kind === 'string' || kind === 'file' || kind === 'files' || kind === 'list';
}

/**
 * The kind a Field is configured as: the admin may mark a text input as a file
 * input, or unmark a detected one.
 */
export function fieldKind(field: FieldConfig, property: JsonSchema): PropertyKind {
  const { kind } = propertyShape(field.name, property);
  if (isFileField(field)) return kind === 'list' || kind === 'files' ? 'files' : 'file';
  if (kind === 'file') return 'string';
  if (kind === 'files') return 'list';
  return kind;
}

/** The media kinds a file input probably takes, judged by its name. */
export function suggestAccept(name: string): MediaKind[] {
  if (/video/.test(name)) return ['video'];
  if (/audio|voice|speech|sound|music/.test(name)) return ['audio'];
  if (/mesh|glb|3d/.test(name)) return ['model3d'];
  return ['image'];
}

/**
 * A new Model's Field configs, one per input property in fal's order: the
 * prompt, file inputs, aspect ratio or image size, the output count and every
 * other required input are shown; everything else keeps fal's default.
 */
export function defaultFieldConfigs(input: JsonSchema): FieldConfig[] {
  const properties = input.properties ?? {};
  const required = new Set(input.required ?? []);
  const falOrder = Array.isArray(input['x-fal-order-properties'])
    ? input['x-fal-order-properties'].filter((name): name is string => typeof name === 'string' && name in properties)
    : [];
  const names = [...falOrder, ...Object.keys(properties).filter((name) => !falOrder.includes(name))];

  return names.map((name, order) => {
    const { kind } = propertyShape(name, properties[name] as JsonSchema);
    const isFile = kind === 'file' || kind === 'files';
    const shown = isFile || required.has(name) || SHOWN_BY_DEFAULT.has(name);
    return { name, mode: shown ? 'shown' : 'default', order, ...(isFile ? { display: 'file', accept: suggestAccept(name) } : {}) };
  });
}

/** Suggests what one request is billed for from fal's unit: images by the count input, seconds by `duration`, else 1. */
export function suggestPricing(price: { unit: string; unitPrice: number; currency: string }, input: JsonSchema): StudioPricing {
  const properties = input.properties ?? {};
  const unit = price.unit.toLowerCase().replace(/s$/, '');
  const countField = COUNT_FIELDS.find((name) => name in properties);
  let quantity: StudioPricing['quantity'] = { kind: 'fixed', value: 1 };
  if (unit === 'image' && countField) quantity = { kind: 'field', field: countField };
  if (unit === 'second' && 'duration' in properties) quantity = { kind: 'field', field: 'duration' };
  return { unit: price.unit, unitPrice: price.unitPrice, currency: price.currency, quantity };
}

/** The fal categories the catalog search can filter by: those whose Models make media. */
export const CATALOG_CATEGORIES = [
  'text-to-image',
  'image-to-image',
  'text-to-video',
  'image-to-video',
  'video-to-video',
  'text-to-audio',
  'audio-to-audio',
  'text-to-speech',
  'image-to-3d',
  'text-to-3d',
] as const;

/** Whether the catalog search offers a fal category: never one whose Models answer with text, nor training. */
export function isOfferedCategory(category: string): boolean {
  return !['llm', 'vision', 'speech-to-text', 'training'].includes(category) && !/-to-(text|json)$/.test(category);
}

/** The values a Field can take, when there are finitely many: its narrowed options, the enum, or on/off. */
export function enumerableValues(field: FieldConfig, property: JsonSchema): JsonValue[] | null {
  const kind = fieldKind(field, property);
  if (kind === 'enum') return field.options?.map((option) => option.value) ?? propertyShape(field.name, property).enum ?? [];
  if (kind === 'boolean') return [true, false];
  return null;
}

/**
 * Why the `visibleIf` of the card `owner` cannot be saved. `possibleValues`
 * gives a dependency's values: null when it has no fixed set, which allows any
 * listed value, and undefined when no card has that name. `nouns` name the
 * owner's kind and what it may depend on.
 */
export function visibleIfProblems(
  owner: string,
  { field: dependency, in: allowed }: VisibleIf,
  possibleValues: (name: string) => JsonValue[] | null | undefined,
  nouns: { self: string; targets: string },
): string[] {
  if (dependency === owner) return [`A ${nouns.self} cannot depend on itself.`];
  const possible = possibleValues(dependency);
  if (possible === undefined) return [`Shown only when references ${dependency}, which is not a ${nouns.targets}.`];
  if (allowed.length === 0) return ['Shown only when needs at least one value.'];
  return allowed
    .filter((value) => possible && !possible.some((candidate) => sameValue(candidate, value)))
    .map((value) => `Shown only when lists ${String(value)}, which ${dependency} cannot be.`);
}

/**
 * Every reason a Model's Field configs and pricing cannot be saved, phrased
 * for the card of the Field they name (`pricing` for the pricing panel).
 * `dependencies` are the Template Variables a Field's `visibleIf` may name
 * besides Fields, with their values when there are finitely many.
 */
export function validateModelConfig(
  fields: FieldConfig[],
  input: JsonSchema,
  pricing?: StudioPricing | null,
  dependencies: Record<string, JsonValue[] | null> = {},
): RequestIssue[] {
  const properties = input.properties ?? {};
  const byName = new Map<string, FieldConfig>();
  const issues: RequestIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field, message });

  for (const field of fields) {
    if (byName.has(field.name)) add(field.name, 'This input has two cards.');
    byName.set(field.name, field);
  }

  for (const field of fields) {
    const property = properties[field.name];
    if (!property) {
      add(field.name, 'This is not an input of the model.');
      continue;
    }
    const shape = propertyShape(field.name, property);
    const kind = fieldKind(field, property);
    const isFile = kind === 'file' || kind === 'files';

    if (isFile && !canTakeFiles(shape.kind)) {
      add(field.name, 'Only a text input can take files.');
      continue;
    }
    if (isFile && field.accept?.length === 0) add(field.name, 'A file input must accept at least one media kind.');
    if (field.display && !DISPLAYS[kind].includes(field.display))
      add(field.name, `${KIND_NAMES[kind]} cannot be displayed as ${field.display}.`);
    if (field.mode === 'shown' && DISPLAYS[kind].length === 0) {
      add(field.name, `${KIND_NAMES[kind]} cannot be shown to Users. Fix its value or leave it to fal.`);
    }

    if (kind === 'integer' || kind === 'number') {
      if (field.min !== undefined && shape.minimum !== undefined && field.min < shape.minimum) {
        add(field.name, `The minimum cannot be below the schema minimum of ${shape.minimum}.`);
      }
      if (field.max !== undefined && shape.maximum !== undefined && field.max > shape.maximum) {
        add(field.name, `The maximum cannot be above the schema maximum of ${shape.maximum}.`);
      }
      const min = field.min ?? shape.minimum;
      const max = field.max ?? shape.maximum;
      if (min !== undefined && max !== undefined && min > max) add(field.name, 'The minimum is above the maximum.');
      if (field.step !== undefined && field.step <= 0) add(field.name, 'The step must be above 0.');
      if (field.mode === 'shown' && field.display === 'slider' && (min === undefined || max === undefined)) {
        add(field.name, 'A slider needs a minimum and a maximum.');
      }
    } else if (field.min !== undefined || field.max !== undefined || field.step !== undefined) {
      add(field.name, 'Only a number can have a range.');
    }

    if (field.options) {
      if (kind !== 'enum') add(field.name, 'Only a choice can have options.');
      else if (field.options.length === 0) add(field.name, 'Offer at least one choice.');
      for (const option of field.options) {
        if (kind === 'enum' && !shape.enum?.includes(option.value)) add(field.name, `${option.value} is not a choice of this input.`);
      }
    }

    if (field.mode === 'fixed') {
      if (isFile) add(field.name, 'A file input cannot be fixed.');
      else if (isEmpty(field.value)) add(field.name, 'A fixed Field needs a value.');
    }
    if (field.mode !== 'default' && !isFile && !isEmpty(field.value)) {
      const problem = valueProblem(field.value, property, field);
      if (problem) add(field.name, `The value ${problem}.`);
    }

    if (field.visibleIf) {
      const possibleValues = (name: string) => {
        if (Object.hasOwn(dependencies, name)) return dependencies[name] ?? null;
        const target = byName.get(name);
        const targetProperty = properties[name];
        return target && targetProperty ? enumerableValues(target, targetProperty) : undefined;
      };
      for (const message of visibleIfProblems(field.name, field.visibleIf, possibleValues, { self: 'Field', targets: 'Field' })) {
        add(field.name, message);
      }
    }
  }

  for (const name of input.required ?? []) {
    const field = byName.get(name);
    if (!field || field.mode === 'default') add(name, 'The model requires this input, so it must be shown or fixed.');
  }

  if (pricing?.quantity.kind === 'field' && !(pricing.quantity.field in properties)) {
    add('pricing', `The price is counted by ${pricing.quantity.field}, which is not an input of the model.`);
  }
  if (pricing?.quantity.kind === 'fixed' && !(pricing.quantity.value > 0)) add('pricing', 'The quantity must be above 0.');

  return issues;
}
