import type { JsonValue } from '@/db/schema/json';
import { DISPLAYS, defaultFieldConfigs, enumerableValues, fieldKind, propertyShape, validateModelConfig } from './model-config';
import { isEmpty, isFileField, type RequestIssue, sameValue, valueProblem } from './request';
import { brokenProperties, describeSchemaDiff, diffInputSchemas, type SchemaDiff } from './schema-diff';
import { validateTemplateConfig } from './template-config';
import type { FieldConfig, JsonSchema, StudioPricing, VariableConfig } from './types';
import { reconcileVariables } from './variables';

/**
 * What applying fal's pending schema to a Model does to its Field configs and
 * to its Templates': the reconciled configs, which cards used a removed or
 * changed input, and the issues left that refuse the Apply. Pure: the server
 * plans it for the Model editor's drift panel and again for Apply.
 */

export interface ConfigPlan {
  fields: FieldConfig[];
  variables: VariableConfig[];
  /** Field and Variable names that use a removed or changed input. */
  affected: string[];
  /** Against the new schema; any of them refuses the Apply. */
  issues: RequestIssue[];
}

export interface TemplatePlan extends ConfigPlan {
  id: string;
  name: string;
}

export interface SchemaApplyPlan {
  diff: SchemaDiff;
  /** The diff in plain words. */
  changes: string[];
  model: ConfigPlan;
  templates: TemplatePlan[];
}

interface TemplateConfig {
  id: string;
  name: string;
  fields: FieldConfig[];
  variables: VariableConfig[];
}

export function planSchemaApply({
  before,
  after,
  model,
  templates,
}: {
  before: JsonSchema;
  after: JsonSchema;
  model: { fields: FieldConfig[]; pricing: StudioPricing | null };
  templates: TemplateConfig[];
}): SchemaApplyPlan {
  const diff = diffInputSchemas(before, after);
  const broken = brokenProperties(diff);
  const usesBroken = (field: FieldConfig) => field.mode !== 'default' && broken.has(field.name);

  const modelFields = reconcileFields(model.fields, after, diff);
  return {
    diff,
    changes: describeSchemaDiff(diff),
    model: {
      fields: modelFields,
      variables: [],
      affected: model.fields.filter(usesBroken).map((field) => field.name),
      issues: validateModelConfig(modelFields, after, model.pricing),
    },
    templates: templates.map((template) => {
      const fields = reconcileFields(template.fields, after, diff);
      const variables = reconcileTemplateVariables(template.variables, fields, after, diff);
      const fileVariables = template.variables.filter((variable) => variable.file && broken.has(variable.file.field));
      return {
        id: template.id,
        name: template.name,
        fields,
        variables,
        affected: [...template.fields.filter(usesBroken), ...fileVariables].map((card) => card.name),
        issues: validateTemplateConfig({ fields, variables, input: after }),
      };
    }),
  };
}

/** Whether the plan leaves an issue on the Model or any of its Templates. */
export function isApplyRefused(plan: SchemaApplyPlan): boolean {
  return plan.model.issues.length > 0 || plan.templates.some((template) => template.issues.length > 0);
}

/**
 * Fits Field configs to the new schema: removed inputs lose their card, new
 * ones get one at fal's default (shown when required), and narrowed options,
 * ranges, shown defaults and conditions are cut to what the schema still
 * allows. Fixed values stay as they are, for validation to report.
 */
function reconcileFields(fields: FieldConfig[], after: JsonSchema, diff: SchemaDiff): FieldConfig[] {
  const properties = after.properties ?? {};
  const kept = fields.filter((field) => properties[field.name]).map((field) => fitField(field, properties[field.name] as JsonSchema));

  let order = Math.max(-1, ...kept.map((field) => field.order));
  const required = new Set(after.required ?? []);
  const defaults = new Map(defaultFieldConfigs(after).map((field) => [field.name, field]));
  for (const name of diff.added) {
    if (kept.some((field) => field.name === name)) continue;
    const suggested = defaults.get(name) ?? { name, mode: 'default', order: 0 };
    kept.push({ ...suggested, mode: required.has(name) ? 'shown' : 'default', order: ++order });
  }

  const removed = new Set(diff.removed);
  const byName = new Map(kept.map((field) => [field.name, field]));
  return kept.map((field) => {
    if (!field.visibleIf || !removed.has(field.visibleIf.field)) return fitCondition(field, byName, properties);
    const { visibleIf: _dropped, ...rest } = field;
    return rest;
  });
}

function fitField(field: FieldConfig, property: JsonSchema): FieldConfig {
  const shape = propertyShape(field.name, property);
  const next: FieldConfig = { ...field };
  if (isFileField(next) && !['string', 'file', 'files', 'list'].includes(shape.kind)) {
    delete next.display;
    delete next.accept;
  }

  const kind = fieldKind(next, property);
  if (kind === 'enum' && next.options) next.options = next.options.filter((option) => shape.enum?.includes(option.value));
  else delete next.options;
  if (kind === 'integer' || kind === 'number') {
    if (next.min !== undefined && shape.minimum !== undefined && next.min < shape.minimum) delete next.min;
    if (next.max !== undefined && shape.maximum !== undefined && next.max > shape.maximum) delete next.max;
  } else {
    delete next.min;
    delete next.max;
    delete next.step;
  }
  if (next.display && !DISPLAYS[kind].includes(next.display)) delete next.display;
  if (next.mode === 'shown' && !isEmpty(next.value) && valueProblem(next.value, property, next)) delete next.value;
  return next;
}

/** Cuts a condition on a Field to the values that Field can still take; one left with none is dropped. */
function fitCondition(field: FieldConfig, byName: Map<string, FieldConfig>, properties: Record<string, JsonSchema>): FieldConfig {
  const condition = field.visibleIf;
  const target = condition && byName.get(condition.field);
  const property = condition && properties[condition.field];
  if (!condition || !target || !property) return field;
  const possible = enumerableValues(target, property);
  if (!possible) return field;
  const allowed = condition.in.filter((value: JsonValue) => possible.some((candidate) => sameValue(candidate, value)));
  if (allowed.length === condition.in.length) return field;
  const { visibleIf: _old, ...rest } = field;
  return allowed.length > 0 ? { ...rest, visibleIf: { field: condition.field, in: allowed } } : rest;
}

/** File Variables of removed inputs go, and so do text Variables no remaining text uses. */
function reconcileTemplateVariables(
  variables: VariableConfig[],
  fields: FieldConfig[],
  after: JsonSchema,
  diff: SchemaDiff,
): VariableConfig[] {
  const properties = after.properties ?? {};
  const removed = new Set(diff.removed);
  const kept = variables
    .filter((variable) => !variable.file || properties[variable.file.field])
    .map((variable) => {
      if (!variable.visibleIf || !removed.has(variable.visibleIf.field)) return variable;
      const { visibleIf: _dropped, ...rest } = variable;
      return rest;
    });
  const texts = fields.flatMap((field) => (field.mode === 'fixed' && typeof field.value === 'string' ? [field.value] : []));
  return reconcileVariables(texts, kept);
}
