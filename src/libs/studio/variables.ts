import type { FieldConfig, VariableConfig } from './types';

/** Applies a Template's Variables to its Field configs. Currently a pass-through, which is right for a Model. */
export function substituteVariables(fields: FieldConfig[], _variables: VariableConfig[], _values: Record<string, unknown>): FieldConfig[] {
  return fields;
}
