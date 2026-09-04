import { cn } from '@/libs/utils';
import styles from './JsonDiff.module.css';

interface JsonDiffProps {
  before?: any;
  after?: any;
  className?: string;
  side: 'before' | 'after';
}

interface DiffNode {
  key: string;
  path: string[];
  beforeValue: any;
  afterValue: any;
  status: 'added' | 'removed' | 'modified' | 'unchanged';
  isObject: boolean;
  isArray: boolean;
}

function deepDiff(before: any, after: any, path: string[] = []): DiffNode[] {
  const result: DiffNode[] = [];

  if (before === null || before === undefined) {
    if (after === null || after === undefined) {
      return result;
    }
    // Value was added
    if (typeof after === 'object') {
      if (Array.isArray(after)) {
        result.push({
          key: path.join('.') || 'root',
          path,
          beforeValue: before,
          afterValue: after,
          status: 'added',
          isObject: false,
          isArray: true,
        });
        after.forEach((item: any, index: number) => {
          result.push(...deepDiff(undefined, item, [...path, index.toString()]));
        });
      } else {
        result.push({
          key: path.join('.') || 'root',
          path,
          beforeValue: before,
          afterValue: after,
          status: 'added',
          isObject: true,
          isArray: false,
        });
        Object.keys(after).forEach((key) => {
          result.push(...deepDiff(undefined, after[key], [...path, key]));
        });
      }
    } else {
      result.push({
        key: path.join('.') || 'root',
        path,
        beforeValue: before,
        afterValue: after,
        status: 'added',
        isObject: false,
        isArray: false,
      });
    }
    return result;
  }

  if (after === null || after === undefined) {
    // Value was removed
    if (typeof before === 'object') {
      if (Array.isArray(before)) {
        result.push({
          key: path.join('.') || 'root',
          path,
          beforeValue: before,
          afterValue: after,
          status: 'removed',
          isObject: false,
          isArray: true,
        });
        before.forEach((item: any, index: number) => {
          result.push(...deepDiff(item, undefined, [...path, index.toString()]));
        });
      } else {
        result.push({
          key: path.join('.') || 'root',
          path,
          beforeValue: before,
          afterValue: after,
          status: 'removed',
          isObject: true,
          isArray: false,
        });
        Object.keys(before).forEach((key) => {
          result.push(...deepDiff(before[key], undefined, [...path, key]));
        });
      }
    } else {
      result.push({
        key: path.join('.') || 'root',
        path,
        beforeValue: before,
        afterValue: after,
        status: 'removed',
        isObject: false,
        isArray: false,
      });
    }
    return result;
  }

  // Both values exist
  if (typeof before !== typeof after) {
    // Type changed
    result.push({
      key: path.join('.') || 'root',
      path,
      beforeValue: before,
      afterValue: after,
      status: 'modified',
      isObject: false,
      isArray: false,
    });
    return result;
  }

  if (typeof before === 'object') {
    if (Array.isArray(before) && Array.isArray(after)) {
      // Array comparison
      const maxLength = Math.max(before.length, after.length);

      for (let i = 0; i < maxLength; i++) {
        const childDiff = deepDiff(before[i], after[i], [...path, i.toString()]);
        result.push(...childDiff);
      }

      // Don't add container modification flags - let individual items handle their own changes
    } else if (!Array.isArray(before) && !Array.isArray(after)) {
      // Object comparison
      const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

      for (const key of allKeys) {
        const childDiff = deepDiff(before[key], after[key], [...path, key]);
        result.push(...childDiff);
      }

      // Don't add container modification flags - let individual items handle their own changes
    } else {
      // Array vs Object
      result.push({
        key: path.join('.') || 'root',
        path,
        beforeValue: before,
        afterValue: after,
        status: 'modified',
        isObject: false,
        isArray: false,
      });
    }
  } else {
    // Primitive comparison
    if (before !== after) {
      result.push({
        key: path.join('.') || 'root',
        path,
        beforeValue: before,
        afterValue: after,
        status: 'modified',
        isObject: false,
        isArray: false,
      });
    }
  }

  return result;
}

/**
 * Tint for one rendered value: the removal colour on the "before" side, the
 * addition colour on the "after" side, nothing when the leaf did not change.
 */
function highlight(diff: DiffNode | undefined, side: 'before' | 'after'): string | undefined {
  if (!diff || diff.status === 'unchanged') return undefined;
  if (side === 'before' && (diff.status === 'removed' || diff.status === 'modified')) return styles.removed;
  if (side === 'after' && (diff.status === 'added' || diff.status === 'modified')) return styles.added;
  return undefined;
}

function formatValue(value: any, maxLength = 100): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') {
    if (value.length > maxLength) {
      return `"${value.substring(0, maxLength - 3)}..."`;
    }
    return `"${value}"`;
  }
  if (typeof value === 'number') return value.toString();
  if (value instanceof Date) return value.toLocaleString();

  const str = JSON.stringify(value);
  if (str.length > maxLength) {
    return `${str.substring(0, maxLength - 3)}...`;
  }
  return str;
}

function renderJsonWithHighlights(
  value: any,
  diffs: DiffNode[],
  side: 'before' | 'after',
  path: string[] = [],
  depth = 0,
): React.ReactNode {
  if (value === null || value === undefined) {
    // Only highlight leaf nodes, not containers
    const diff = diffs.find((d) => d.path.join('.') === path.join('.') && !d.isObject && !d.isArray);

    return <span className={highlight(diff, side)}>{formatValue(value, 50)}</span>;
  }

  if (typeof value === 'object') {
    const indent = '  '.repeat(depth);
    const nextIndent = '  '.repeat(depth + 1);

    if (Array.isArray(value)) {
      if (value.length === 0) {
        return <span>[]</span>;
      }

      return (
        <span>
          {'[\n'}
          {value.map((item, index) => {
            const itemPath = [...path, index.toString()];
            // Only highlight primitive values, not objects/arrays
            const diff = diffs.find((d) => d.path.join('.') === itemPath.join('.') && !d.isObject && !d.isArray);

            return (
              <span key={itemPath.join('.')}>
                {nextIndent}
                <span className={highlight(diff, side)}>{renderJsonWithHighlights(item, diffs, side, itemPath, depth + 1)}</span>
                {index < value.length - 1 && ','}
                {'\n'}
              </span>
            );
          })}
          {indent}
          {']'}
        </span>
      );
    }
    const keys = Object.keys(value);
    if (keys.length === 0) {
      return <span>{'{}'}</span>;
    }

    return (
      <span>
        {'{\n'}
        {keys.map((key, index) => {
          const keyPath = [...path, key];
          // Only highlight primitive values, not objects/arrays
          const diff = diffs.find((d) => d.path.join('.') === keyPath.join('.') && !d.isObject && !d.isArray);

          return (
            <span key={key}>
              {nextIndent}
              <span className={styles.key}>"{key}"</span>:{' '}
              <span className={highlight(diff, side)}>{renderJsonWithHighlights(value[key], diffs, side, keyPath, depth + 1)}</span>
              {index < keys.length - 1 && ','}
              {'\n'}
            </span>
          );
        })}
        {indent}
        {'}'}
      </span>
    );
  }

  // Primitive value - only highlight leaf nodes
  const diff = diffs.find((d) => d.path.join('.') === path.join('.') && !d.isObject && !d.isArray);

  return <span className={highlight(diff, side)}>{formatValue(value, 50)}</span>;
}

export function JsonDiff({ before, after, className, side }: JsonDiffProps) {
  const diffs = deepDiff(before, after);
  const value = side === 'before' ? before : after;

  if (typeof value !== 'object' || value === null || value === undefined) {
    // For primitive values at root level, only highlight if it's actually a changed leaf node
    const diff = diffs.find((d) => d.path.length === 0 && !d.isObject && !d.isArray);

    return (
      <div className={cn(styles.root, className)}>
        <span className={highlight(diff, side)}>{formatValue(value)}</span>
      </div>
    );
  }

  return (
    <div
      className={cn(styles.root, className)}
      data-shape="tree"
    >
      {renderJsonWithHighlights(value, diffs, side)}
    </div>
  );
}
