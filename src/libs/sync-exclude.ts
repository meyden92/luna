/** Builds a predicate over S3 keys; each pattern must match the whole key, with `*` standing for any run of characters. */
export function syncExcludeMatcher(patterns: string[]): (key: string) => boolean {
  if (patterns.length === 0) return () => false;
  const alternatives = patterns.map((pattern) =>
    pattern
      .split('*')
      .map((literal) => literal.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*'),
  );
  const regex = new RegExp(`^(?:${alternatives.join('|')})$`, 's');
  return (key) => regex.test(key);
}
