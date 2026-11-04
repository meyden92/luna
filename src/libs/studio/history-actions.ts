import type { JsonValue } from '@/db/schema/json';
import type { StudioCatalogCategory, StudioEntry } from './catalog';
import { buildStudioForm, type StudioFile, type StudioFormSpec, type StudioFormValues } from './form';
import { isFileRef } from './request';
import type { FieldConfig, FileRef, MediaKind } from './types';

/** What the history's actions do to the Studio form. Pure. */

export interface ContinueTarget {
  category: StudioCatalogCategory;
  entry: StudioEntry;
  /** The file input the Output goes into. */
  field: string;
}

/**
 * *Continue with …*: per Category, the first entry with a shown file input
 * that accepts the media kind. Categories without one are not offered.
 */
export function continueTargets(categories: StudioCatalogCategory[], mediaKind: MediaKind): ContinueTarget[] {
  const targets: ContinueTarget[] = [];
  for (const category of categories) {
    for (const entry of category.entries) {
      const item = buildStudioForm(entry).items.find(
        (candidate) => candidate.control === 'file' && (!candidate.accept || candidate.accept.includes(mediaKind)),
      );
      if (item) {
        targets.push({ category, entry, field: item.name });
        break;
      }
    }
  }
  return targets;
}

/** Puts an Output into a file input: it replaces a single file, and joins a list (taking the last place once it is full). */
export function attachOutput(form: StudioFormSpec, values: StudioFormValues, field: string, ref: FileRef): StudioFormValues {
  const item = form.items.find((candidate) => candidate.name === field);
  if (!item?.multiple) return { ...values, [field]: ref };
  const current = values[field];
  const list: StudioFile[] = Array.isArray(current) ? (current as StudioFile[]) : [];
  const room = item.maxItems === undefined || list.length < item.maxItems;
  return { ...values, [field]: room ? [...list, ref] : [...list.slice(0, (item.maxItems ?? 1) - 1), ref] };
}

const MAX_SEED = 2 ** 31 - 1;

/**
 * *Again*: the same values with a new random seed when Users set the `seed`
 * Field. A fixed seed stays; one left to fal is picked anew by fal anyway.
 */
export function reseedValues<T extends Record<string, unknown>>(fields: FieldConfig[], values: T, random: () => number = Math.random): T {
  const seed = fields.find((field) => field.name === 'seed');
  if (seed?.mode !== 'shown') return values;
  const min = Math.ceil(seed.min ?? 0);
  const max = Math.floor(seed.max ?? MAX_SEED);
  return { ...values, seed: min + Math.floor(random() * (max - min + 1)) };
}

/**
 * *Use settings*: a Generation's `form_values` as the form can take them
 * again. Files and Outputs stay while `usable` says they exist; uploads, kept
 * only as fal URLs, cannot be sent from the form and are dropped.
 */
export function reusableValues(values: Record<string, JsonValue>, usable: (ref: FileRef) => boolean): Record<string, JsonValue> {
  const keep = (value: JsonValue) => !isFileRef(value) || (value.source !== 'url' && value.source !== 'upload' && usable(value));
  const reused: Record<string, JsonValue> = {};
  for (const [name, value] of Object.entries(values)) {
    if (Array.isArray(value) && value.some(isFileRef)) reused[name] = value.filter(keep);
    else if (keep(value)) reused[name] = value;
  }
  return reused;
}
