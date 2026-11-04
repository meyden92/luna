import type { FieldConfig, JsonSchema, StudioPricing, VariableConfig } from './types';

/**
 * What the Studio screen offers a User: the Categories with their active
 * Models and Templates, as `getStudioCatalog` returns them. Client-safe types.
 */

export interface StudioEntry {
  kind: 'model' | 'template';
  id: string;
  name: string;
  description: string | null;
  categoryId: string;
  fields: FieldConfig[];
  /** Empty for Models. */
  variables: VariableConfig[];
  /** The Model's input schema snapshot. */
  schema: JsonSchema;
  pricing: StudioPricing | null;
  /** Signed URLs of a Template's preview images. */
  previewUrls: string[];
}

export interface StudioCatalogCategory {
  id: string;
  name: string;
  icon: string;
  entries: StudioEntry[];
}

/** The search params naming the selected Category and entry. */
export interface StudioSelection {
  category?: string;
  model?: string;
  template?: string;
}

export function selectionOf(entry: StudioEntry): StudioSelection {
  return entry.kind === 'model' ? { category: entry.categoryId, model: entry.id } : { category: entry.categoryId, template: entry.id };
}

/** The entry a Generation ran, by its Template, else its Model. */
export function findEntry(
  categories: StudioCatalogCategory[],
  target: { modelId: string | null; templateId: string | null },
): StudioEntry | undefined {
  const entries = categories.flatMap((category) => category.entries);
  if (target.templateId) return entries.find((entry) => entry.kind === 'template' && entry.id === target.templateId);
  return entries.find((entry) => entry.kind === 'model' && entry.id === target.modelId);
}
