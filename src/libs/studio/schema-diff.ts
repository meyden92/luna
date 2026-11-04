import { KIND_NAMES, type PropertyKind, type PropertyShape, propertyShape } from './model-config';
import type { JsonSchema } from './types';

/**
 * What changed between a Model's input schema snapshot and fal's current
 * one, as far as Field configs care: properties, their kind, enum options,
 * ranges and whether they are required. Descriptions and defaults are
 * ignored. Pure.
 */

type Bound = 'minimum' | 'maximum' | 'minItems' | 'maxItems';
const BOUNDS: Bound[] = ['minimum', 'maximum', 'minItems', 'maxItems'];

export interface PropertyChange {
  name: string;
  kind?: { before: PropertyKind; after: PropertyKind };
  optionsAdded?: string[];
  optionsRemoved?: string[];
  /** An absent `before` or `after` means the schema had no such bound. */
  range?: { bound: Bound; before?: number; after?: number }[];
  required?: 'added' | 'removed';
}

export interface SchemaDiff {
  added: string[];
  removed: string[];
  changed: PropertyChange[];
}

export function diffInputSchemas(before: JsonSchema, after: JsonSchema): SchemaDiff {
  const old = before.properties ?? {};
  const now = after.properties ?? {};
  const wasRequired = new Set(before.required ?? []);
  const isRequired = new Set(after.required ?? []);
  const diff: SchemaDiff = {
    added: Object.keys(now).filter((name) => !(name in old)),
    removed: Object.keys(old).filter((name) => !(name in now)),
    changed: [],
  };

  for (const [name, property] of Object.entries(old)) {
    const next = now[name];
    if (!next) continue;
    const change = propertyChange(name, propertyShape(name, property), propertyShape(name, next));
    if (wasRequired.has(name) !== isRequired.has(name)) change.required = isRequired.has(name) ? 'added' : 'removed';
    if (Object.keys(change).length > 1) diff.changed.push(change);
  }
  return diff;
}

function propertyChange(name: string, before: PropertyShape, after: PropertyShape): PropertyChange {
  const change: PropertyChange = { name };
  if (before.kind !== after.kind) change.kind = { before: before.kind, after: after.kind };
  else if (before.kind === 'enum') {
    const added = (after.enum ?? []).filter((option) => !before.enum?.includes(option));
    const removed = (before.enum ?? []).filter((option) => !after.enum?.includes(option));
    if (added.length > 0) change.optionsAdded = added;
    if (removed.length > 0) change.optionsRemoved = removed;
  }
  const range = BOUNDS.flatMap((bound) =>
    before[bound] === after[bound]
      ? []
      : [
          {
            bound,
            ...(before[bound] === undefined ? {} : { before: before[bound] }),
            ...(after[bound] === undefined ? {} : { after: after[bound] }),
          },
        ],
  );
  if (range.length > 0) change.range = range;
  return change;
}

export function isEmptyDiff(diff: SchemaDiff): boolean {
  return diff.added.length + diff.removed.length + diff.changed.length === 0;
}

/** The names of the properties a Field config or file Variable may break on: removed or changed ones. */
export function brokenProperties(diff: SchemaDiff): Set<string> {
  return new Set([...diff.removed, ...diff.changed.map((change) => change.name)]);
}

const BOUND_NAMES: Record<Bound, string> = {
  minimum: 'the minimum',
  maximum: 'the maximum',
  minItems: 'the minimum number of items',
  maxItems: 'the maximum number of items',
};

const kindName = (kind: PropertyKind) => KIND_NAMES[kind].replace(/^./, (first) => first.toLowerCase());
const list = (values: string[]) => values.join(', ');

/** One sentence per added, removed and changed input, for the admin. */
export function describeSchemaDiff(diff: SchemaDiff): string[] {
  const lines = [...diff.added.map((name) => `New input: ${name}.`), ...diff.removed.map((name) => `Removed input: ${name}.`)];
  for (const change of diff.changed) {
    const parts: string[] = [];
    if (change.kind) parts.push(`changed from ${kindName(change.kind.before)} to ${kindName(change.kind.after)}`);
    if (change.optionsAdded) parts.push(`new option${change.optionsAdded.length > 1 ? 's' : ''} ${list(change.optionsAdded)}`);
    if (change.optionsRemoved) parts.push(`option${change.optionsRemoved.length > 1 ? 's' : ''} ${list(change.optionsRemoved)} removed`);
    for (const { bound, before, after } of change.range ?? []) {
      if (before === undefined) parts.push(`${BOUND_NAMES[bound]} is now ${after}`);
      else if (after === undefined) parts.push(`${BOUND_NAMES[bound]} of ${before} was removed`);
      else parts.push(`${BOUND_NAMES[bound]} changed from ${before} to ${after}`);
    }
    if (change.required) parts.push(change.required === 'added' ? 'now required' : 'no longer required');
    lines.push(`${change.name}: ${parts.join('; ')}.`);
  }
  return lines;
}
