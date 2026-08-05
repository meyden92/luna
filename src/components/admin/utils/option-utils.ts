import type { TemplateVariableOption } from '@/types/template';

/**
 * Normalizes a dropdown option from string or object format into the standard TemplateVariableOption format.
 * Handles both legacy string options and the newer object format.
 */
export const normalizeOption = (option: string | TemplateVariableOption): TemplateVariableOption => {
  if (typeof option === 'string') {
    return { label: option, value: option, enabled: true };
  }
  return {
    ...option,
    enabled: option.enabled !== false,
    previewSize: option.previewSize || 'default',
  };
};
