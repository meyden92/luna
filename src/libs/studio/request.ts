import type { JsonValue } from '@/db/schema/json';
import { isRecord } from '@/libs/is-record';
import { UserFacingError } from '@/libs/user-facing-error';
import type { FieldConfig, FileRef, JsonSchema, VariableConfig } from './types';
import { substituteVariables } from './variables';
import { visibilityResolver } from './visibility';

/**
 * Builds a Generation's `request_input` from a Model's or Template's Field
 * configs and the User's `form_values`, validating it against the Model's
 * snapshot schema narrowed by the config.
 *
 * - `default` Fields are omitted, so fal applies its own default.
 * - `fixed` Fields send their `value`, whatever the User sent.
 * - `shown` Fields send the User's value, else the configured default; an
 *   empty optional one is omitted.
 * - Fields hidden by `visibleIf` are neither validated nor sent.
 * - A Template's Variables are applied first (`substituteVariables`).
 *
 * File inputs stay `FileRef`s here; the pipeline uploads them and swaps in the
 * fal URLs. Pure, so the client could run it too.
 */

export interface RequestIssue {
  field: string;
  message: string;
}

/** Every problem with a submission, with a message naming the Fields. */
export class RequestValidationError extends UserFacingError {
  readonly issues: RequestIssue[];

  constructor(issues: RequestIssue[]) {
    super(issues.map((issue) => issue.message).join(' '), 'RequestValidationError');
    this.issues = issues;
  }
}

export type RequestInput = Record<string, JsonValue | FileRef | FileRef[]>;

export function isFileField(field: FieldConfig): boolean {
  return field.display === 'file' || field.accept !== undefined;
}

export function isFileRef(value: unknown): value is FileRef {
  if (!isRecord(value)) return false;
  const ref = value;
  switch (ref.source) {
    case 'upload':
      return typeof ref.key === 'string' && ref.key.length > 0;
    case 'file':
      return typeof ref.fileId === 'string' && ref.fileId.length > 0;
    case 'output':
      return typeof ref.outputId === 'string' && ref.outputId.length > 0;
    case 'url':
      return typeof ref.url === 'string' && URL.canParse(ref.url) && typeof ref.expiresAt === 'string';
    default:
      return false;
  }
}

export function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

export function sameValue(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

export function buildRequestInput(options: {
  fields: FieldConfig[];
  schema: JsonSchema;
  values: Record<string, unknown>;
  variables?: VariableConfig[];
}): RequestInput {
  const { schema, values } = options;
  const substituted = substituteVariables({ fields: options.fields, variables: options.variables ?? [], values, schema });
  const { fields, variableValues } = substituted;
  const byName = new Map(fields.map((field) => [field.name, field]));
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);

  /** The value a Field would send if visible: fixed, else the User's, else the configured or schema default. */
  const effectiveValue = (field: FieldConfig): unknown => {
    if (field.mode === 'fixed') return field.value;
    if (field.mode === 'default') return properties[field.name]?.default;
    return isEmpty(values[field.name]) ? field.value : values[field.name];
  };

  const isVisible = visibilityResolver(fields, effectiveValue, (name) =>
    Object.hasOwn(variableValues, name) ? variableValues[name] : values[name],
  );

  const input: RequestInput = {};
  const issues: RequestIssue[] = [...substituted.issues];

  for (const field of fields) {
    const label = field.label ?? field.name;
    const property = properties[field.name];
    if (!property) {
      issues.push({ field: field.name, message: `${label} is not an input of this model.` });
      continue;
    }
    if (field.mode === 'default' || !isVisible(field.name)) continue;

    const value = effectiveValue(field);
    if (isEmpty(value)) {
      if (required.has(field.name)) issues.push({ field: field.name, message: `${label} is required.` });
      continue;
    }

    const problem = isFileField(field) ? fileProblem(value, property) : valueProblem(value, property, field);
    if (problem) {
      issues.push({ field: field.name, message: `${label} ${problem}.` });
      continue;
    }
    input[field.name] = value as JsonValue | FileRef | FileRef[];
  }

  for (const name of required) {
    const field = byName.get(name);
    if (!field || field.mode === 'default') {
      issues.push({ field: name, message: `${field?.label ?? name} is required by the model but not configured.` });
    }
  }

  if (issues.length > 0) throw new RequestValidationError(issues);
  return input;
}

function fileProblem(value: unknown, property: JsonSchema): string | null {
  if (!acceptsType(property, 'array')) return isFileRef(value) ? null : 'must be a file';
  if (!Array.isArray(value) || !value.every(isFileRef)) return 'must be a list of files';
  const list = nonNullBranch(property);
  if (list.minItems !== undefined && value.length < list.minItems) return `needs at least ${list.minItems} files`;
  if (list.maxItems !== undefined && value.length > list.maxItems) return `takes at most ${list.maxItems} files`;
  return null;
}

/** The non-null branch of a nullable property, or the property itself. */
function nonNullBranch(property: JsonSchema): JsonSchema {
  return property.anyOf?.find((branch) => branch.type !== 'null') ?? property;
}

function acceptsType(property: JsonSchema, type: string): boolean {
  const branches = property.anyOf ?? [property];
  return branches.some((branch) => (Array.isArray(branch.type) ? branch.type.includes(type) : branch.type === type));
}

/** Why `value` does not satisfy `property` narrowed by `field`, or null. Phrased to follow the Field's label. */
export function valueProblem(value: unknown, property: JsonSchema, field?: FieldConfig): string | null {
  if (property.anyOf) {
    const problems = property.anyOf.map((branch) => valueProblem(value, branch, field));
    return problems.includes(null) ? null : (problems.find((problem) => problem !== 'must be empty') ?? 'is invalid');
  }

  const types = property.type === undefined ? [] : Array.isArray(property.type) ? property.type : [property.type];
  if (types.length > 0 && !types.some((type) => hasType(value, type))) return describeType(types);

  if (field?.options && !field.options.some((option) => sameValue(option.value, value))) return 'is not one of the offered choices';
  if (property.enum && !property.enum.some((candidate) => sameValue(candidate, value))) return 'is not one of the offered choices';

  if (typeof value === 'number') {
    const min = maxDefined(property.minimum, field?.min);
    const max = minDefined(property.maximum, field?.max);
    if (min !== undefined && value < min) return `must be at least ${min}`;
    if (max !== undefined && value > max) return `must be at most ${max}`;
    if (property.exclusiveMinimum !== undefined && value <= property.exclusiveMinimum) return `must be above ${property.exclusiveMinimum}`;
    if (property.exclusiveMaximum !== undefined && value >= property.exclusiveMaximum) return `must be below ${property.exclusiveMaximum}`;
  }
  if (typeof value === 'string') {
    if (property.minLength !== undefined && value.length < property.minLength) return `needs at least ${property.minLength} characters`;
    if (property.maxLength !== undefined && value.length > property.maxLength) return `takes at most ${property.maxLength} characters`;
  }
  if (Array.isArray(value)) {
    if (property.minItems !== undefined && value.length < property.minItems) return `needs at least ${property.minItems} entries`;
    if (property.maxItems !== undefined && value.length > property.maxItems) return `takes at most ${property.maxItems} entries`;
    const { items } = property;
    if (items) {
      for (const item of value) {
        const problem = valueProblem(item, items);
        if (problem) return `has an entry that ${problem.replace(/^must /, 'does not ')}`;
      }
    }
  }
  return null;
}

function hasType(value: unknown, type: string): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return isRecord(value);
    case 'null':
      return value === null;
    default:
      return true;
  }
}

function describeType(types: string[]): string {
  if (types.length === 1 && types[0] === 'null') return 'must be empty';
  const names: Record<string, string> = {
    string: 'text',
    integer: 'a whole number',
    number: 'a number',
    boolean: 'on or off',
    array: 'a list',
    object: 'an object',
  };
  return `must be ${types.map((type) => names[type] ?? type).join(' or ')}`;
}

function maxDefined(...values: (number | undefined)[]): number | undefined {
  const defined = values.filter((value): value is number => value !== undefined);
  return defined.length > 0 ? Math.max(...defined) : undefined;
}

function minDefined(...values: (number | undefined)[]): number | undefined {
  const defined = values.filter((value): value is number => value !== undefined);
  return defined.length > 0 ? Math.min(...defined) : undefined;
}
