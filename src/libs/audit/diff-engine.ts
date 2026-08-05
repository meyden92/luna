import type { DiffResult, FieldChange } from '@/types/audit';

export class DiffEngine {
  private static readonly IGNORED_FIELDS = ['updatedAt', 'createdAt'];

  static calculateDiff(before: unknown, after: unknown, basePath = ''): FieldChange[] {
    const changes: FieldChange[] = [];

    if (before === after) return changes;
    if (!before && !after) return changes;

    // Handle null/undefined cases
    if (!before && after) {
      return [
        {
          path: basePath || 'root',
          type: 'added',
          before: undefined,
          after,
          dataType: DiffEngine.getDataType(after),
        },
      ];
    }

    if (before && !after) {
      return [
        {
          path: basePath || 'root',
          type: 'removed',
          before,
          after: undefined,
          dataType: DiffEngine.getDataType(before),
        },
      ];
    }

    // Handle primitive types
    if (DiffEngine.isPrimitive(before) || DiffEngine.isPrimitive(after)) {
      if (before !== after) {
        changes.push({
          path: basePath || 'root',
          type: 'modified',
          before,
          after,
          dataType: DiffEngine.getDataType(after),
        });
      }
      return changes;
    }

    // Handle arrays
    if (Array.isArray(before) || Array.isArray(after)) {
      return DiffEngine.diffArrays(before, after, basePath);
    }

    // Handle objects
    const beforeObj = (before ?? {}) as Record<string, unknown>;
    const afterObj = (after ?? {}) as Record<string, unknown>;
    const allKeys = new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]);

    for (const key of allKeys) {
      if (DiffEngine.IGNORED_FIELDS.includes(key)) continue;

      const beforeValue = beforeObj[key];
      const afterValue = afterObj[key];
      const fieldPath = basePath ? `${basePath}.${key}` : key;

      if (!(key in beforeObj)) {
        changes.push({
          path: fieldPath,
          type: 'added',
          before: undefined,
          after: afterValue,
          dataType: DiffEngine.getDataType(afterValue),
        });
      } else if (!(key in afterObj)) {
        changes.push({
          path: fieldPath,
          type: 'removed',
          before: beforeValue,
          after: undefined,
          dataType: DiffEngine.getDataType(beforeValue),
        });
      } else if (beforeValue !== afterValue) {
        if (DiffEngine.isObject(beforeValue) && DiffEngine.isObject(afterValue)) {
          const nestedChanges = DiffEngine.calculateDiff(beforeValue, afterValue, fieldPath);
          changes.push(...nestedChanges);
        } else {
          changes.push({
            path: fieldPath,
            type: 'modified',
            before: beforeValue,
            after: afterValue,
            dataType: DiffEngine.getDataType(afterValue),
          });
        }
      }
    }

    return changes;
  }

  private static diffArrays(before: unknown, after: unknown, basePath: string): FieldChange[] {
    const changes: FieldChange[] = [];
    const beforeArr: unknown[] = Array.isArray(before) ? before : [];
    const afterArr: unknown[] = Array.isArray(after) ? after : [];

    const maxLength = Math.max(beforeArr.length, afterArr.length);
    for (let i = 0; i < maxLength; i++) {
      const itemPath = `${basePath}[${i}]`;

      if (i >= beforeArr.length) {
        changes.push({
          path: itemPath,
          type: 'added',
          before: undefined,
          after: afterArr[i],
          dataType: DiffEngine.getDataType(afterArr[i]),
        });
      } else if (i >= afterArr.length) {
        changes.push({
          path: itemPath,
          type: 'removed',
          before: beforeArr[i],
          after: undefined,
          dataType: DiffEngine.getDataType(beforeArr[i]),
        });
      } else if (beforeArr[i] !== afterArr[i]) {
        if (DiffEngine.isObject(beforeArr[i]) && DiffEngine.isObject(afterArr[i])) {
          const nestedChanges = DiffEngine.calculateDiff(beforeArr[i], afterArr[i], itemPath);
          changes.push(...nestedChanges);
        } else {
          changes.push({
            path: itemPath,
            type: 'modified',
            before: beforeArr[i],
            after: afterArr[i],
            dataType: DiffEngine.getDataType(afterArr[i]),
          });
        }
      }
    }

    return changes;
  }

  private static isPrimitive(value: unknown): boolean {
    return (
      value === null ||
      value === undefined ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value instanceof Date
    );
  }

  private static isObject(value: unknown): boolean {
    return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
  }

  private static getDataType(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (value instanceof Date) return 'date';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }

  static generateDiffResult(before: unknown, after: unknown): DiffResult {
    const changes = DiffEngine.calculateDiff(before, after);
    const summary = DiffEngine.generateSummary(changes);

    return {
      changes,
      summary,
      hasChanges: changes.length > 0,
    };
  }

  private static generateSummary(changes: FieldChange[]): string {
    if (changes.length === 0) return 'No changes';

    const added = changes.filter((c) => c.type === 'added').length;
    const modified = changes.filter((c) => c.type === 'modified').length;
    const removed = changes.filter((c) => c.type === 'removed').length;

    const parts: string[] = [];
    if (added > 0) parts.push(`${added} field${added > 1 ? 's' : ''} added`);
    if (modified > 0) parts.push(`${modified} field${modified > 1 ? 's' : ''} modified`);
    if (removed > 0) parts.push(`${removed} field${removed > 1 ? 's' : ''} removed`);

    return parts.join(', ');
  }
}
