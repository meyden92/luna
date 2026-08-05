const TEMPLATE_VARIABLE_PATTERN = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

interface TemplateVariableLike {
  name?: string;
  type?: string;
  options?: unknown[];
}

export interface TemplateVariableValidationResult {
  unused: string[];
  missing: string[];
  invalidDropdowns: string[];
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function validateTemplateVariablesInPrompt(variables: TemplateVariableLike[], prompt: string): TemplateVariableValidationResult {
  const promptVariables = dedupe(
    Array.from(prompt.matchAll(TEMPLATE_VARIABLE_PATTERN))
      .map((match) => match[1]?.trim())
      .filter((name): name is string => Boolean(name)),
  );

  const definedVariables = dedupe(variables.map((variable) => variable.name?.trim()).filter((name): name is string => Boolean(name)));

  const unused = definedVariables.filter((variableName) => !promptVariables.includes(variableName));
  const missing = promptVariables.filter((variableName) => !definedVariables.includes(variableName));

  const invalidDropdowns = dedupe(
    variables
      .filter((variable) => variable.type === 'dropdown')
      .filter((variable) => {
        if (!Array.isArray(variable.options) || variable.options.length === 0) {
          return true;
        }

        return variable.options.some((option) => {
          if (typeof option === 'string') {
            return option.trim().length === 0;
          }

          if (typeof option === 'object' && option !== null) {
            const optionRecord = option as { label?: unknown; value?: unknown };
            const label = typeof optionRecord.label === 'string' ? optionRecord.label.trim() : '';
            const value = typeof optionRecord.value === 'string' ? optionRecord.value.trim() : '';
            return label.length === 0 || value.length === 0;
          }

          return true;
        });
      })
      .map((variable) => variable.name?.trim())
      .filter((name): name is string => Boolean(name)),
  );

  return {
    unused,
    missing,
    invalidDropdowns,
  };
}
