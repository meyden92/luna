import { queryOptions } from '@tanstack/react-query';
import { normalizeOption } from '@/components/admin/utils/option-utils';
import { queryKeys } from '@/libs/query-keys';
import { getTemplateImageUrl } from '@/libs/utils';
import { listAiTemplates } from '@/server/fns/ai';
import type { TemplateVariable, TemplateVariableOption } from '@/types/template';

/** A template as the gallery and runner need it: the row plus its global variables. */
export interface AiTemplate {
  id: string;
  name: string;
  description: string | null;
  prompt: string;
  inputImageCount: number;
  minImageCount: number;
  maxImageCount: number;
  variables: unknown;
  previewImages: string | null;
  globalVariables?: Array<{
    id: string;
    required: boolean | null;
    addedOptions: unknown;
    globalVariable: {
      id: string;
      name: string;
      label: string;
      type: string;
      description: string | null;
      defaultValue: string | null;
      options: unknown;
      required: boolean;
    };
  }>;
}

export const templatesQueryOptions = queryOptions({
  queryKey: queryKeys.ai.templates,
  queryFn: () => listAiTemplates() as Promise<{ templates: AiTemplate[] }>,
  staleTime: 60_000,
});

/**
 * A template's own variables followed by the global ones attached to it, with
 * per-template extra options folded into the global variable's list. This is the
 * order the runner renders controls in.
 */
export function resolveTemplateVariables(template: AiTemplate): TemplateVariable[] {
  const inline = Array.isArray(template.variables) ? (template.variables as TemplateVariable[]) : [];

  const global: TemplateVariable[] = (template.globalVariables ?? []).map((attached) => {
    const variable = attached.globalVariable;
    const options = Array.isArray(variable.options) ? [...(variable.options as TemplateVariableOption[])] : [];
    if (Array.isArray(attached.addedOptions)) options.push(...(attached.addedOptions as TemplateVariableOption[]));

    return {
      id: `global-${variable.id}`,
      name: variable.name,
      label: variable.label,
      type: variable.type as TemplateVariable['type'],
      required: attached.required ?? variable.required,
      options,
      defaultValue: variable.defaultValue,
      description: variable.description,
    } satisfies TemplateVariable;
  });

  return [...inline, ...global].filter((variable) => variable.enabled !== false);
}

/**
 * Dropdown options normalised: legacy templates store bare strings. Options the
 * admin switched off are dropped rather than offered as dead choices, which is
 * what every other consumer of `normalizeOption` already does.
 */
export function variableOptions(variable: TemplateVariable): Array<{ label: string; value: string }> {
  return (variable.options ?? [])
    .map(normalizeOption)
    .filter((option) => option.enabled)
    .map((option) => ({ label: option.label, value: option.value }));
}

/** Cover images for a template card; `previewImages` is a JSON array of bucket keys. */
export function templatePreviewImages(template: AiTemplate): string[] {
  if (!template.previewImages) return [];
  try {
    const parsed = JSON.parse(template.previewImages);
    return Array.isArray(parsed) ? parsed.map((entry: string) => getTemplateImageUrl(entry)) : [];
  } catch {
    return [];
  }
}

/** The defaults a template starts from, so its first render is already runnable. */
export function templateVariableDefaults(variables: TemplateVariable[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};

  for (const variable of variables) {
    if (variable.type === 'boolean') {
      values[variable.name] = variable.defaultValue === 'true';
    } else if (variable.type === 'dropdown') {
      // A default the admin has since switched off is no longer an option, and
      // seeding it would leave the segmented control with nothing active.
      const options = variableOptions(variable);
      const chosen = options.find((option) => option.value === variable.defaultValue);
      values[variable.name] = chosen?.value ?? options[0]?.value ?? '';
    } else if (variable.defaultValue != null && variable.defaultValue !== '') {
      values[variable.name] = variable.defaultValue;
    } else {
      values[variable.name] = '';
    }
  }

  return values;
}
