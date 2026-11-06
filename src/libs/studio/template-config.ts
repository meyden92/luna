import type { JsonValue } from '@/db/schema/json';
import { canTakeFiles, enumerableValues, fieldKind, propertyShape, validateModelConfig, visibleIfProblems } from './model-config';
import { isEmpty, isFileField, type RequestIssue } from './request';
import type { FieldConfig, JsonSchema, VariableConfig } from './types';
import { parseVariables } from './variables';

/**
 * How a Template's Field cards start out and what makes a Template valid.
 * Pure, shared by the Template editor (inline issues) and the server (save
 * and test refuse).
 */

const NAME = /^[a-z0-9_]+$/;

/**
 * A new Template's Field cards from its Model's: what Users fill in becomes
 * fixed at the Model's value, or at the Generation's when `values` come from
 * one (*Save as Template*). File inputs cannot be fixed, so they stay shown.
 */
export function templateFieldDefaults(modelFields: FieldConfig[], input: JsonSchema, values: Record<string, unknown> = {}): FieldConfig[] {
  const properties = input.properties ?? {};
  return [...modelFields]
    .sort((a, b) => a.order - b.order)
    .map((field) => {
      const property = properties[field.name];
      if (field.mode !== 'shown' || !property || isFileField(field)) return field;
      const given = values[field.name];
      const value = isEmpty(given) ? (field.value ?? propertyShape(field.name, property).default) : (given as JsonValue);
      const { value: _value, ...rest } = field;
      return { ...rest, mode: 'fixed' as const, ...(value === undefined ? {} : { value }) };
    });
}

/** The Model inputs a file Variable can feed: those detected as file inputs, and whether each takes a list. */
export function fileInputs(input: JsonSchema): { name: string; list: boolean }[] {
  return Object.entries(input.properties ?? {}).flatMap(([name, property]) => {
    const { kind } = propertyShape(name, property);
    return kind === 'file' || kind === 'files' ? [{ name, list: kind === 'files' }] : [];
  });
}

/** The Variable names the fixed texts use, with the first Field each appears in. */
function namesInTexts(fields: FieldConfig[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const field of fields) {
    if (field.mode !== 'fixed' || typeof field.value !== 'string') continue;
    for (const { name } of parseVariables(field.value)) if (!names.has(name)) names.set(name, field.name);
  }
  return names;
}

/** The values a Variable can take when there are finitely many, for `visibleIf`; null when it has no fixed set. */
function variableValues(variable: VariableConfig): JsonValue[] | null {
  if (variable.kind === 'choice') return variable.options?.map((option) => option.value) ?? [];
  if (variable.kind === 'switch') return [true, false];
  return null;
}

/**
 * Every reason a Template cannot be saved or tested, keyed by the Field or
 * Variable whose card shows it. Covers the Model checks for its Fields, the
 * texts and cards agreeing, each kind's settings, `visibleIf` references and
 * that every required file input is shown or fed by a required file Variable.
 * A Field a file Variable feeds is the Variable's, so its own mode is not checked.
 */
export function validateTemplateConfig({
  fields,
  variables,
  input,
}: {
  fields: FieldConfig[];
  variables: VariableConfig[];
  input: JsonSchema;
}): RequestIssue[] {
  const properties = input.properties ?? {};
  const issues: RequestIssue[] = [];
  const add = (field: string, message: string) => issues.push({ field, message });
  const fieldsByName = new Map(fields.map((field) => [field.name, field]));
  const variablesByName = new Map<string, VariableConfig>();

  for (const variable of variables) {
    if (variablesByName.has(variable.name)) add(variable.name, `Two Variables are called ${variable.name}.`);
    variablesByName.set(variable.name, variable);
    if (!NAME.test(variable.name)) add(variable.name, 'A Variable name takes only a-z, 0-9 and _.');
    else if (variable.name in properties) add(variable.name, `${variable.name} is also an input of the model. Rename the Variable.`);
  }

  // The texts and the cards agree.
  const used = namesInTexts(fields);
  for (const [name, field] of used) {
    const card = variablesByName.get(name);
    if (!card) add(field, `Uses {${name}}, which has no Variable card.`);
    else if (card.kind === 'file') add(field, `Uses {${name}}, but a file Variable cannot be written into a text.`);
  }
  for (const variable of variables) {
    if (variable.kind !== 'file' && !used.has(variable.name)) add(variable.name, `No text uses {${variable.name}}.`);
  }

  for (const variable of variables) {
    for (const message of kindProblems(variable, properties)) add(variable.name, message);
  }

  // File Variables: one place each, and the inputs they feed.
  const fed = new Map<string, VariableConfig[]>();
  for (const variable of variables) {
    if (variable.kind !== 'file' || !variable.file || !properties[variable.file.field]) continue;
    const { field, position } = variable.file;
    const others = fed.get(field) ?? [];
    const clash = others.find((other) => other.file?.position === undefined || position === undefined || other.file.position === position);
    if (clash) {
      add(
        variable.name,
        position === undefined
          ? `Another file Variable already feeds ${field}.`
          : `Another file Variable already feeds position ${position + 1} of ${field}.`,
      );
    }
    fed.set(field, [...others, variable]);
  }
  for (const [name, feeders] of fed) {
    if (input.required?.includes(name) && !feeders.some((variable) => variable.required)) {
      for (const variable of feeders) add(variable.name, `The model requires ${name}, so this file input must be required.`);
    }
  }

  // Visibility: a Variable may depend on a Field or Variable, and so may a Field.
  const possibleValues = (name: string) => {
    const target = variablesByName.get(name);
    if (target) return variableValues(target);
    const field = fieldsByName.get(name);
    const property = properties[name];
    return field && property ? enumerableValues(field, property) : undefined;
  };
  for (const variable of variables) {
    if (!variable.visibleIf) continue;
    const nouns = { self: 'Variable', targets: 'Field or Variable' };
    const problems = visibleIfProblems(variable.name, variable.visibleIf, possibleValues, nouns);
    const { field: dependency } = variable.visibleIf;
    if (problems.length === 0 && possibleValues(dependency) === null) {
      problems.push(`Shown only when references ${dependency}, which has no fixed set of values.`);
    }
    for (const message of problems) add(variable.name, message);
  }

  // The Model checks, for the Fields no file Variable feeds.
  const dependencies = Object.fromEntries(variables.map((variable) => [variable.name, variableValues(variable)]));
  issues.push(
    ...validateModelConfig(
      fields.filter((field) => !fed.has(field.name)),
      { ...input, required: (input.required ?? []).filter((name) => !fed.has(name)) },
      null,
      dependencies,
    ),
  );
  return issues;
}

/** What is wrong with a Variable's kind-specific settings and its default. */
function kindProblems(variable: VariableConfig, properties: Record<string, JsonSchema>): string[] {
  const problems: string[] = [];
  const fallback = variable.default;
  switch (variable.kind) {
    case 'choice':
    case 'multi': {
      const values = (variable.options ?? []).map((option) => option.value);
      if (values.length === 0) problems.push('A choice needs at least one option.');
      if (values.some((value) => value.trim() === '')) problems.push('An option needs a value.');
      if (values.some((value) => /[|{}]/.test(value))) problems.push('An option cannot contain |, { or }.');
      const duplicate = values.find((value, index) => values.indexOf(value) !== index);
      if (duplicate !== undefined) problems.push(`Two options insert ${duplicate}.`);
      const defaults = fallback === undefined ? [] : Array.isArray(fallback) ? fallback : [fallback];
      if (variable.kind === 'choice' && Array.isArray(fallback)) problems.push('A choice has one default.');
      for (const value of defaults) {
        if (typeof value !== 'string' || !values.includes(value)) problems.push(`The default ${String(value)} is not one of the options.`);
      }
      break;
    }
    case 'number': {
      const range = variable.number;
      if (!range) {
        problems.push('A number needs a minimum, a maximum and a step.');
        break;
      }
      if (range.min > range.max) problems.push('The minimum is above the maximum.');
      if (!(range.step > 0)) problems.push('The step must be above 0.');
      if (fallback !== undefined && (typeof fallback !== 'number' || fallback < range.min || fallback > range.max)) {
        problems.push(`The default must be a number from ${range.min} to ${range.max}.`);
      }
      break;
    }
    case 'switch':
      if (!variable.switch) problems.push('A switch needs a text for on and one for off.');
      if (fallback !== undefined && typeof fallback !== 'boolean') problems.push('The default must be on or off.');
      break;
    case 'file': {
      const target = variable.file;
      if (!target) {
        problems.push('A file Variable needs the input it feeds.');
        break;
      }
      const property = properties[target.field];
      if (!property) {
        problems.push(`${target.field} is not an input of the model.`);
        break;
      }
      const kind = fieldKind({ name: target.field, mode: 'shown', order: 0, display: 'file' }, property);
      const shape = propertyShape(target.field, property);
      if (!canTakeFiles(shape.kind)) {
        problems.push(`${target.field} cannot take files.`);
      } else if (target.position !== undefined) {
        if (kind !== 'files') problems.push(`${target.field} takes one file, so it has no positions.`);
        else if (!Number.isInteger(target.position) || target.position < 0) problems.push('The position must be 1 or more.');
        else if (shape.maxItems !== undefined && target.position >= shape.maxItems) {
          problems.push(`${target.field} takes at most ${shape.maxItems} files.`);
        }
      }
      if (target.accept.length === 0) problems.push('A file input must accept at least one media kind.');
      break;
    }
    default: {
      const maxLength = variable.text?.maxLength;
      if (maxLength !== undefined && !(maxLength > 0)) problems.push('The maximum length must be above 0.');
      if (fallback !== undefined && typeof fallback !== 'string') problems.push('The default must be text.');
      else if (typeof fallback === 'string' && maxLength !== undefined && fallback.length > maxLength) {
        problems.push(`The default is longer than ${maxLength} characters.`);
      }
    }
  }
  return problems;
}
