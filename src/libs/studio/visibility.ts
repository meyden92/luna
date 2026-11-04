import { sameValue } from './request';
import type { VisibleIf } from './types';

/**
 * Resolves `visibleIf` over named items (Fields, Variables or form items): an
 * item shows while the item it depends on is visible and holds a listed value.
 * A hidden dependency has no value, so a cycle hides every item in it. A
 * dependency that is not one of `items` reads `outsideValue`.
 */
export function visibilityResolver<T extends { name: string; visibleIf?: VisibleIf }>(
  items: Iterable<T>,
  itemValue: (item: T) => unknown,
  outsideValue: (name: string) => unknown,
): (name: string) => boolean {
  const byName = new Map<string, T>();
  for (const item of items) byName.set(item.name, item);
  const cache = new Map<string, boolean>();

  /** `chain` holds the names whose visibility is being resolved, `name` included. */
  const isVisible = (name: string, chain: Set<string>): boolean => {
    const cached = cache.get(name);
    if (cached !== undefined) return cached;
    const condition = byName.get(name)?.visibleIf;
    if (!condition) return true;
    const dependency = byName.get(condition.field);
    let current: unknown;
    if (!dependency) current = outsideValue(condition.field);
    else if (!chain.has(condition.field) && isVisible(condition.field, new Set(chain).add(condition.field))) {
      current = itemValue(dependency);
    }
    const visible = condition.in.some((candidate) => sameValue(candidate, current));
    cache.set(name, visible);
    return visible;
  };

  return (name) => isVisible(name, new Set([name]));
}
