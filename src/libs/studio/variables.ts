import { humanize } from './format';
import { isEmpty, isFileRef, type RequestIssue, sameValue } from './request';
import { type FieldConfig, type FileRef, type JsonSchema, MEDIA_KINDS, type VariableConfig } from './types';

/**
 * Template Variables: `{name}` and `{name: A | *B | C}` inside fixed text
 * Fields. Parsing and write-back for the editor, substitution for the
 * server. Pure, shared by both.
 */

/** One `{name}` or `{name: …}` occurrence; group 1 is the name, group 2 the options text. */
const TOKEN = /\{([a-z0-9_]+)(?:\s*:([^{}]*))?\}/g;

export interface ParsedVariable {
  name: string;
  /** Only for `{name: …}`; `isDefault` marks the `*` option. */
  options?: { value: string; isDefault: boolean }[];
}

/** The distinct Variables of a text in order of first use; options come from the first occurrence that lists any. */
export function parseVariables(text: string): ParsedVariable[] {
  const found = new Map<string, ParsedVariable>();
  for (const match of text.matchAll(TOKEN)) {
    const name = match[1] as string;
    const options = match[2] === undefined ? undefined : parseOptions(match[2]);
    const known = found.get(name);
    if (!known) found.set(name, options ? { name, options } : { name });
    else if (!known.options && options) known.options = options;
  }
  return [...found.values()];
}

/** The text cut into plain runs and Variable tokens, each with where it starts, for highlighting. */
export function tokenSegments(text: string): { text: string; token: boolean; start: number }[] {
  const segments: { text: string; token: boolean; start: number }[] = [];
  let at = 0;
  for (const match of text.matchAll(TOKEN)) {
    if (match.index > at) segments.push({ text: text.slice(at, match.index), token: false, start: at });
    segments.push({ text: match[0], token: true, start: match.index });
    at = match.index + match[0].length;
  }
  if (at < text.length) segments.push({ text: text.slice(at), token: false, start: at });
  return segments;
}

function parseOptions(text: string): ParsedVariable['options'] {
  return text
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part !== '' && part !== '*')
    .map((part) => (part.startsWith('*') ? { value: part.slice(1).trim(), isDefault: true } : { value: part, isDefault: false }));
}

/** `parseVariables` over several texts, as if they were one. */
function parseTexts(texts: string[]): ParsedVariable[] {
  const found = new Map<string, ParsedVariable>();
  for (const parsed of texts.flatMap(parseVariables)) {
    const known = found.get(parsed.name);
    if (!known) found.set(parsed.name, parsed);
    else if (!known.options && parsed.options) known.options = parsed.options;
  }
  return [...found.values()];
}

const hasOptions = (variable: VariableConfig) => variable.kind === 'choice' || variable.kind === 'multi';

/**
 * The Template editor's Variable cards for its fixed texts: one per name the
 * texts use, keeping each existing card, plus every file Variable. New names
 * get a text card, or a choice card when they list options, after the rest.
 * A choice's options and default always come from the text; labels stay
 * with their option by value.
 */
export function reconcileVariables(texts: string[], existing: VariableConfig[]): VariableConfig[] {
  const parsed = parseTexts(texts);
  const used = new Set(parsed.map((variable) => variable.name));
  const kept = existing.filter((variable) => variable.kind === 'file' || used.has(variable.name));
  let order = Math.max(-1, ...kept.map((variable) => variable.order));

  const cards = new Map(kept.map((variable) => [variable.name, variable]));
  for (const { name, options } of parsed) {
    const card = cards.get(name);
    if (card?.kind === 'file') continue;
    if (!options && (!card || !hasOptions(card))) {
      if (!card) cards.set(name, { name, kind: 'text', required: false, order: ++order });
      continue;
    }
    const base: VariableConfig = card ?? { name, kind: 'choice', required: false, order: ++order };
    // The card already says what the text says, maybe with an option still being typed: keep it as it is.
    const written = base.options?.flatMap((option) => (option.value === '' ? [] : [option.value]));
    const parsedValues = (options ?? []).map((option) => option.value);
    if (hasOptions(base) && sameValue(written, parsedValues) && sameDefault(base, options ?? [])) continue;
    const kind = hasOptions(base) ? base.kind : 'choice';
    const defaults = (options ?? []).filter((option) => option.isDefault).map((option) => option.value);
    const fallback = kind === 'multi' ? (defaults.length > 0 ? defaults : undefined) : defaults[0];
    const { default: _old, ...rest } = base;
    cards.set(name, {
      ...rest,
      kind,
      ...(fallback === undefined ? {} : { default: fallback }),
      options: (options ?? []).map(({ value }) => ({ label: base.options?.find((option) => option.value === value)?.label ?? '', value })),
    });
  }
  return [...cards.values()];
}

/** Whether the card's default is what the parsed `*` marks say. */
function sameDefault(card: VariableConfig, options: NonNullable<ParsedVariable['options']>): boolean {
  const marked = options.filter((option) => option.isDefault).map((option) => option.value);
  if (card.kind === 'multi') return sameValue(card.default ?? [], marked);
  return card.default === marked[0];
}

/**
 * Writes a Variable card back into the texts: its first occurrence becomes
 * `{name: A | *B}` with the card's options and default, every other one a
 * plain `{name}`. A kind without options leaves plain names everywhere.
 */
export function writeVariableTokens(texts: string[], variable: VariableConfig): string[] {
  const { name } = variable;
  const plain = `{${name}}`;
  const isDefault = (value: string) => (Array.isArray(variable.default) ? variable.default.includes(value) : variable.default === value);
  const options = hasOptions(variable) ? (variable.options ?? []).filter((option) => option.value !== '') : [];
  const full =
    options.length > 0 ? `{${name}: ${options.map(({ value }) => `${isDefault(value) ? '*' : ''}${value}`).join(' | ')}}` : plain;

  let written = false;
  return texts.map((text) =>
    text.replace(TOKEN, (token, found: string) => {
      if (found !== name) return token;
      if (written) return plain;
      written = true;
      return full;
    }),
  );
}

/**
 * A Template's Field configs with its Variables applied to the User's
 * values, as `buildRequestInput` sends them:
 *
 * - every `{name}` in a fixed text Field becomes the Variable's text: a
 *   choice's option value, multi-choice values joined with ", ", a switch's
 *   on or off text, a number, or the text typed; empty values leave no
 *   doubled spaces or dangling commas behind
 * - a file Variable fixes its target input to the file, or to one position
 *   of a list input, which keeps the filled positions in order
 * - a Variable hidden by `visibleIf` inserts its default or nothing, and is
 *   not validated
 *
 * `variableValues` holds the visible Variables' values, for Fields whose
 * `visibleIf` names a Variable. A Model has no Variables: its Fields come back
 * unchanged.
 */
export function substituteVariables(options: {
  fields: FieldConfig[];
  variables: VariableConfig[];
  values: Record<string, unknown>;
  schema: JsonSchema;
}): { fields: FieldConfig[]; variableValues: Record<string, unknown>; issues: RequestIssue[] } {
  const { variables, values, schema } = options;
  if (variables.length === 0) return { fields: options.fields, variableValues: {}, issues: [] };

  const fields = fileVariableTargets(options.fields, variables);
  const visible = variableVisibility(fields, variables, values, schema);
  const variableValues: Record<string, unknown> = {};
  const inserts = new Map<string, string>();
  const issues: RequestIssue[] = [];

  for (const variable of variables) {
    if (!visible(variable.name)) {
      inserts.set(variable.name, insertedText(variable, variable.default, false));
      continue;
    }
    const value = variableValue(variable, values);
    if (value !== undefined) variableValues[variable.name] = value;
    inserts.set(variable.name, insertedText(variable, value, true));
    const problem = variableProblem(variable, value);
    if (problem) issues.push({ field: variable.name, message: `${variable.label || humanize(variable.name)} ${problem}.` });
  }

  const substituted = fields.map((field) => {
    if (field.mode === 'fixed' && typeof field.value === 'string' && hasVariables(field.value)) {
      return { ...field, value: tidy(field.value.replace(TOKEN, (_token, name: string) => inserts.get(name) ?? '')) };
    }
    const fed = variables.filter((variable) => variable.kind === 'file' && variable.file?.field === field.name);
    if (fed.length === 0) return field;
    const refs = [...fed]
      .sort((a, b) => (a.file?.position ?? 0) - (b.file?.position ?? 0))
      .flatMap((variable) => (visible(variable.name) && isFileRef(values[variable.name]) ? [values[variable.name] as FileRef] : []));
    if (refs.length === 0) return field;
    const list = isListInput(schema.properties?.[field.name]);
    return { ...field, mode: 'fixed' as const, value: list ? refs : (refs[0] as FileRef) };
  });

  return { fields: substituted, variableValues, issues };
}

/**
 * The Field configs with every input a file Variable feeds marked as a file
 * input that accepts what those Variables accept, as the pipeline checks and
 * uploads files.
 */
export function fileVariableTargets(fields: FieldConfig[], variables: VariableConfig[]): FieldConfig[] {
  return fields.map((field) => {
    const fed = variables.filter((variable) => variable.kind === 'file' && variable.file?.field === field.name);
    if (fed.length === 0) return field;
    const accept = MEDIA_KINDS.filter((kind) => fed.some((variable) => variable.file?.accept.includes(kind)));
    return { ...field, display: 'file' as const, accept };
  });
}

function hasVariables(text: string): boolean {
  return parseVariables(text).length > 0;
}

function isListInput(property: JsonSchema | undefined): boolean {
  const branches = property?.anyOf ?? (property ? [property] : []);
  return branches.some((branch) => branch.type === 'array');
}

/** The User's value, else the Variable's default; an empty multi-choice counts as empty. */
function variableValue(variable: VariableConfig, values: Record<string, unknown>): unknown {
  const value = values[variable.name];
  return isEmpty(value) || (Array.isArray(value) && value.length === 0) ? variable.default : value;
}

/**
 * Whether a Variable is shown, by its `visibleIf` on another Variable or a
 * Field. A dependency that is itself hidden has no value; a cycle hides.
 */
function variableVisibility(fields: FieldConfig[], variables: VariableConfig[], values: Record<string, unknown>, schema: JsonSchema) {
  const variablesByName = new Map(variables.map((variable) => [variable.name, variable]));
  const fieldsByName = new Map(fields.map((field) => [field.name, field]));
  const cache = new Map<string, boolean>();

  const fieldValue = (field: FieldConfig): unknown => {
    if (field.mode === 'fixed') return field.value;
    if (field.mode === 'default') return schema.properties?.[field.name]?.default;
    return isEmpty(values[field.name]) ? field.value : values[field.name];
  };

  const isVisible = (name: string, seen: Set<string>): boolean => {
    const cached = cache.get(name);
    if (cached !== undefined) return cached;
    const condition = (variablesByName.get(name) ?? fieldsByName.get(name))?.visibleIf;
    if (!condition) return true;
    const dependency = condition.field;
    const variable = variablesByName.get(dependency);
    const field = fieldsByName.get(dependency);
    let current: unknown;
    if (seen.has(dependency)) current = undefined;
    else if (variable) current = isVisible(dependency, new Set(seen).add(name)) ? variableValue(variable, values) : undefined;
    else if (field) current = isVisible(dependency, new Set(seen).add(name)) ? fieldValue(field) : undefined;
    else current = values[dependency];
    const visible = condition.in.some((candidate) => sameValue(candidate, current));
    cache.set(name, visible);
    return visible;
  };

  return (name: string) => isVisible(name, new Set());
}

/** The text a Variable puts into the prompt. A visible switch without a value is off. */
function insertedText(variable: VariableConfig, value: unknown, visible: boolean): string {
  switch (variable.kind) {
    case 'switch':
      if (value === true) return variable.switch?.on ?? '';
      return value === false || visible ? (variable.switch?.off ?? '') : '';
    case 'multi':
      return Array.isArray(value) ? value.filter((item) => typeof item === 'string').join(', ') : '';
    case 'number':
      return typeof value === 'number' ? String(value) : '';
    case 'file':
      return '';
    default:
      return typeof value === 'string' ? value : '';
  }
}

/** Why a visible Variable's value cannot be sent, phrased to follow its label, or null. */
function variableProblem(variable: VariableConfig, value: unknown): string | null {
  if (isEmpty(value) || (Array.isArray(value) && value.length === 0))
    return variable.required && variable.kind !== 'switch' ? 'is required' : null;
  const offered = (candidate: unknown) => variable.options?.some((option) => option.value === candidate) ?? false;
  switch (variable.kind) {
    case 'choice':
      return offered(value) ? null : 'is not one of the offered choices';
    case 'multi':
      return Array.isArray(value) && value.every(offered) ? null : 'is not one of the offered choices';
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return 'must be a number';
      const range = variable.number;
      if (range && value < range.min) return `must be at least ${range.min}`;
      if (range && value > range.max) return `must be at most ${range.max}`;
      return null;
    }
    case 'switch':
      return typeof value === 'boolean' ? null : 'must be on or off';
    case 'file':
      return isFileRef(value) ? null : 'must be a file';
    default: {
      if (typeof value !== 'string') return 'must be text';
      const maxLength = variable.text?.maxLength;
      return maxLength !== undefined && value.length > maxLength ? `takes at most ${maxLength} characters` : null;
    }
  }
}

/** Cleans up after empty insertions: doubled spaces, spaces before punctuation and commas with nothing between them. */
function tidy(text: string): string {
  return text
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+(?=[,.!?;:])/g, '')
    .replace(/,(?:[ \t]*,)+/g, ',')
    .replace(/,[ \t]*(?=[.!?;:)\]]|$)/gm, '')
    .replace(/^([ \t]*),[ \t]*/gm, '$1')
    .replace(/[ \t]+$/gm, '')
    .trim();
}
