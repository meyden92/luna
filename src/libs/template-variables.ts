/**
 * Preview prompt with variables replaced and return structured data for highlighting
 * Returns an array of text segments with metadata for styling
 */
export function previewPromptWithHighlights(
  prompt: string,
  variables: Record<string, any>,
): Array<{ text: string; isVariable: boolean; variableName?: string; isEmpty?: boolean }> {
  const segments: Array<{ text: string; isVariable: boolean; variableName?: string; isEmpty?: boolean }> = [];

  // Use regex to find all variable placeholders with their positions
  const variableRegex = /\{([^}]+)\}/g;
  const matches: Array<{ match: string; variableName: string; start: number; end: number }> = [];

  let match: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: Standard regex pattern matching requires assignment in while loop
  while ((match = variableRegex.exec(prompt)) !== null) {
    if (match[1]) {
      matches.push({
        match: match[0],
        variableName: match[1],
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }

  // Process text segments in order
  let lastIndex = 0;

  for (const { variableName, start, end } of matches) {
    // Add text before this variable if any
    if (start > lastIndex) {
      segments.push({
        text: prompt.substring(lastIndex, start),
        isVariable: false,
      });
    }

    // Process the variable replacement
    const value = variables[variableName];

    if (value === undefined || value === null || value === '__NOTHING__') {
      segments.push({
        text: `[${variableName}]`,
        isVariable: true,
        variableName,
        isEmpty: true,
      });
    } else {
      // Handle objects and arrays by converting to JSON
      let replacement: string;
      if (typeof value === 'object' && value !== null) {
        replacement = JSON.stringify(value, null, 2);
      } else {
        replacement = String(value);
      }

      segments.push({
        text: replacement,
        isVariable: true,
        variableName,
        isEmpty: false,
      });
    }

    lastIndex = end;
  }

  // Add any remaining text after the last variable
  if (lastIndex < prompt.length) {
    segments.push({
      text: prompt.substring(lastIndex),
      isVariable: false,
    });
  }

  return segments;
}
