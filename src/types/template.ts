export interface TemplateVariableOption {
  id?: string;
  label: string;
  value: string;
  enabled?: boolean;
  previewUrl?: string;
  previewSize?: 'small' | 'default' | 'large' | 'raw';
}

export interface TemplateVariable {
  id?: string;
  name: string;
  label: string;
  type: 'text' | 'number' | 'dropdown' | 'boolean';
  description?: string | null;
  defaultValue?: string | null;
  // Dropdown options accept bare strings for backwards compatibility with legacy templates.
  options?: (string | TemplateVariableOption)[];
  required?: boolean;
  enabled?: boolean;
  previewUrl?: string;
  previewSize?: 'small' | 'default' | 'large' | 'raw';
  globalVariableId?: string;
}

export interface EditingModelConfig {
  id: string;
  label: string;
  description: string | null;
  apiModelName: string;
}

export interface Template {
  id: string;
  name: string;
  description: string | null;
  prompt: string;
  inputImageCount: number;
  minImageCount: number;
  maxImageCount: number;
  editingModelId: string | null;
  editingModelFieldValues: Record<string, unknown>;
  isActive: boolean;
  variables: TemplateVariable[];
  previewImages: string | null;
  createdAt: Date;
  updatedAt: Date;
}
