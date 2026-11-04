import type { JsonValue } from '@/db/schema/json';
import { humanize } from './format';
import { fieldKind, propertyShape } from './model-config';
import { isEmpty, sameValue } from './request';
import type { FieldConfig, FileRef, JsonSchema, MediaKind, VariableConfig, VisibleIf } from './types';

/**
 * The form Users fill in, derived from a Model's or Template's configs: what the
 * Studio, the Model editor's preview and the Template editor render through
 * `components/studio/form`. Pure.
 */

export type FormControl = 'text' | 'textarea' | 'number' | 'slider' | 'select' | 'chips' | 'multi' | 'switch' | 'file';

/** One input of the form, keyed by `name` in the form values. */
export interface FormItem {
  name: string;
  control: FormControl;
  label: string;
  help?: string;
  required: boolean;
  /** For `select`, `chips` and `multi`. */
  options?: { value: JsonValue; label: string }[];
  /** For `number` and `slider`. */
  min?: number;
  max?: number;
  step?: number;
  /** A `file` control taking a list; `maxItems` caps it. */
  multiple?: boolean;
  maxItems?: number;
  accept?: MediaKind[];
  placeholder?: string;
  maxLength?: number;
  group?: string;
  order: number;
  visibleIf?: VisibleIf;
  defaultValue?: JsonValue;
}

export interface StudioFormSpec {
  /** In display order. */
  items: FormItem[];
  /** The values of Fields Users do not see (fixed, or fal's default), for `visibleIf`. */
  context: Record<string, JsonValue>;
}

/** A file in the form: picked from the device, or a ref to the User's own File or Output. */
export type StudioFile = File | FileRef;
export type StudioFormValue = JsonValue | StudioFile | StudioFile[];
export type StudioFormValues = Record<string, StudioFormValue>;

const CHIPS_MAX_OPTIONS = 5;

/** A Template's Variables come first, in their order, then the Fields it releases to Users. */
export function buildStudioForm({
  fields,
  schema,
  variables = [],
}: {
  fields: FieldConfig[];
  schema: JsonSchema;
  variables?: VariableConfig[];
}): StudioFormSpec {
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const items: FormItem[] = [...variables].sort((a, b) => a.order - b.order).map(variableItem);
  const context: Record<string, JsonValue> = {};

  for (const field of [...fields].sort((a, b) => a.order - b.order)) {
    const property = properties[field.name];
    if (!property) continue;
    const shape = propertyShape(field.name, property);
    if (field.mode !== 'shown') {
      const value = field.mode === 'fixed' ? field.value : shape.default;
      if (value !== undefined) context[field.name] = value;
      continue;
    }
    items.push(fieldItem(field, property, required.has(field.name)));
  }
  return { items, context };
}

function fieldItem(field: FieldConfig, property: JsonSchema, required: boolean): FormItem {
  const shape = propertyShape(field.name, property);
  const kind = fieldKind(field, property);
  const item: FormItem = {
    name: field.name,
    control: 'text',
    label: field.label || shape.title || humanize(field.name),
    help: field.help || shape.description,
    required,
    group: field.group || undefined,
    order: field.order,
    visibleIf: field.visibleIf,
  };

  switch (kind) {
    case 'enum': {
      const options = field.options ?? (shape.enum ?? []).map((value) => ({ value, label: value }));
      item.options = options.map((option) => ({ value: option.value, label: option.label || option.value }));
      item.control =
        field.display === 'select' || field.display === 'chips' ? field.display : options.length > CHIPS_MAX_OPTIONS ? 'select' : 'chips';
      break;
    }
    case 'integer':
    case 'number': {
      item.min = field.min ?? shape.minimum;
      item.max = field.max ?? shape.maximum;
      const range = item.min !== undefined && item.max !== undefined ? item.max - item.min : undefined;
      item.step = field.step ?? (kind === 'integer' ? 1 : range ? range / 100 : undefined);
      item.control = field.display === 'slider' ? 'slider' : 'number';
      break;
    }
    case 'boolean':
      item.control = 'switch';
      break;
    case 'file':
    case 'files':
      item.control = 'file';
      item.multiple = kind === 'files';
      item.maxItems = kind === 'files' ? shape.maxItems : 1;
      item.accept = field.accept;
      break;
    default:
      item.control = field.display === 'textarea' || (!field.display && /prompt$/.test(field.name)) ? 'textarea' : 'text';
      item.maxLength = property.maxLength;
  }

  const fallback = field.value ?? shape.default;
  const offered = !item.options || item.options.some((option) => sameValue(option.value, fallback));
  if (fallback !== undefined && offered) item.defaultValue = fallback;
  return item;
}

function variableItem(variable: VariableConfig): FormItem {
  const item: FormItem = {
    name: variable.name,
    control: 'text',
    label: variable.label || humanize(variable.name),
    help: variable.help || undefined,
    required: variable.required,
    group: variable.group || undefined,
    order: variable.order,
    visibleIf: variable.visibleIf,
    ...(variable.default === undefined ? {} : { defaultValue: variable.default }),
  };
  switch (variable.kind) {
    case 'choice':
    case 'multi': {
      item.options = (variable.options ?? []).map((option) => ({ value: option.value, label: option.label || option.value }));
      item.control = variable.kind === 'multi' ? 'multi' : item.options.length > CHIPS_MAX_OPTIONS ? 'select' : 'chips';
      break;
    }
    case 'number':
      item.control = variable.number?.display ?? 'number';
      item.min = variable.number?.min;
      item.max = variable.number?.max;
      item.step = variable.number?.step;
      break;
    case 'switch':
      item.control = 'switch';
      break;
    case 'file':
      item.control = 'file';
      item.multiple = false;
      item.maxItems = 1;
      item.accept = variable.file?.accept;
      break;
    default:
      item.control = variable.text?.multiline ? 'textarea' : 'text';
      item.placeholder = variable.text?.placeholder;
      item.maxLength = variable.text?.maxLength;
  }
  return item;
}

/** The values a fresh form starts with: each item's default, and an empty list for multi-file inputs. */
export function initialFormValues(form: StudioFormSpec): StudioFormValues {
  const values: StudioFormValues = {};
  for (const item of form.items) {
    if (item.defaultValue !== undefined) values[item.name] = item.defaultValue;
    else if (item.multiple) values[item.name] = [];
  }
  return values;
}

/**
 * The items to render for these values. Mirrors the server's rule: an item
 * shows only while the Field it depends on is visible and holds a listed
 * value; an empty value counts as its default.
 */
export function visibleFormItems(form: StudioFormSpec, values: StudioFormValues): FormItem[] {
  const byName = new Map(form.items.map((item) => [item.name, item]));
  const visibility = new Map<string, boolean>();

  const isVisible = (item: FormItem, seen: Set<string>): boolean => {
    const cached = visibility.get(item.name);
    if (cached !== undefined) return cached;
    let visible = true;
    if (item.visibleIf) {
      const { field: dependency, in: allowed } = item.visibleIf;
      const target = byName.get(dependency);
      let current: unknown;
      if (!target) current = dependency in form.context ? form.context[dependency] : values[dependency];
      else if (!seen.has(item.name) && isVisible(target, new Set(seen).add(item.name))) {
        current = isEmpty(values[dependency]) ? target.defaultValue : values[dependency];
      }
      visible = allowed.some((candidate) => sameValue(candidate, current));
    }
    visibility.set(item.name, visible);
    return visible;
  };

  return form.items.filter((item) => isVisible(item, new Set()));
}

/**
 * The FormData `submitGeneration` (and the admin test run) takes: `payload`
 * is `{ ...payload, values }` with every picked file replaced by an `upload`
 * ref, and each file is a part named by that ref's key.
 */
export function studioFormData(payload: Record<string, unknown>, values: StudioFormValues): FormData {
  const data = new FormData();
  const sent: Record<string, JsonValue> = {};
  const upload = (file: File, key: string): FileRef => {
    data.append(key, file, file.name);
    return { source: 'upload', key };
  };
  for (const [name, value] of Object.entries(values)) {
    if (value instanceof File) sent[name] = upload(value, name);
    else if (Array.isArray(value))
      sent[name] = value.map((item, index) => (item instanceof File ? upload(item, `${name}.${index}`) : item));
    else sent[name] = value;
  }
  data.set('payload', JSON.stringify({ ...payload, values: sent }));
  return data;
}

/** Reads FormData written by `studioFormData`: the parsed payload, and its files by part name. */
export function readStudioFormData<T>(data: unknown, parsePayload: (payload: unknown) => T): T & { uploads: Map<string, File> } {
  if (!(data instanceof FormData)) throw new Error('Expected FormData');
  const raw = data.get('payload');
  const payload = parsePayload(JSON.parse(typeof raw === 'string' ? raw : 'null'));
  const uploads = new Map<string, File>();
  for (const [key, value] of data.entries() as Iterable<[string, unknown]>) {
    if (value instanceof File) uploads.set(key, value);
  }
  return { ...payload, uploads };
}
