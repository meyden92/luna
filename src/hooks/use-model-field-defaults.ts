import { useEffect } from 'react';

interface FieldWithDefault {
  name: string;
  type: string;
  defaultValue?: string | null;
}

/**
 * Initializes form values from a model's field defaults whenever the field set
 * changes, coercing number/boolean defaults to their proper types.
 */
export function useModelFieldDefaults(fields: FieldWithDefault[] | undefined, onDefaults: (defaults: Record<string, unknown>) => void) {
  useEffect(() => {
    if (!fields) return;

    const defaults: Record<string, unknown> = {};
    for (const field of fields) {
      if (field.defaultValue != null) {
        // Convert default values to appropriate types
        if (field.type === 'number') {
          defaults[field.name] = Number(field.defaultValue);
        } else if (field.type === 'boolean') {
          defaults[field.name] = field.defaultValue === 'true';
        } else {
          defaults[field.name] = field.defaultValue;
        }
      }
    }
    onDefaults(defaults);
  }, [fields, onDefaults]);
}
