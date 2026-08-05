import { CheckCircle2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { TemplateVariable } from '@/types/template';

interface TemplateVariableSectionProps {
  variables: TemplateVariable[];
  values: Record<string, unknown>;
  onChange: (name: string, value: unknown) => void;
}

export function TemplateVariableSection({ variables, values, onChange }: TemplateVariableSectionProps) {
  if (variables.length === 0) {
    return null;
  }

  // Filter to only enabled variables
  const enabledVariables = variables.filter((v) => v.enabled !== false);

  const requiredVariables = enabledVariables.filter((v) => v.required);
  const requiredFieldsFilled = requiredVariables.filter((v) => {
    const fieldValue = values[v.name];
    return fieldValue !== undefined && fieldValue !== '' && fieldValue !== '__NOTHING__';
  }).length;
  const requiredFieldsRemaining = requiredVariables.length - requiredFieldsFilled;
  const allRequiredFieldsFilled = requiredFieldsRemaining === 0 && requiredVariables.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm font-semibold">Template Options</Label>
        {requiredVariables.length > 0 && (
          <div className="text-xs">
            {allRequiredFieldsFilled ? (
              <span className="flex items-center gap-1 text-green-600 dark:text-green-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                All required
              </span>
            ) : (
              <span className="text-muted-foreground">
                <span className="font-semibold text-foreground">{requiredFieldsRemaining}</span> required
              </span>
            )}
          </div>
        )}
      </div>

      {enabledVariables.map((variable) => {
        const value = values[variable.name];

        return (
          <div
            key={variable.name}
            className="space-y-2"
          >
            {variable.type !== 'boolean' && (
              <Label
                htmlFor={variable.name}
                className="text-sm"
              >
                {variable.label}
                {variable.required && <span className="text-destructive ml-1">*</span>}
              </Label>
            )}

            {variable.description && <p className="text-xs text-muted-foreground">{variable.description}</p>}

            {/* Text input */}
            {variable.type === 'text' && (
              <Input
                id={variable.name}
                type="text"
                value={(value as string) || ''}
                onChange={(e) => onChange(variable.name, e.target.value)}
                placeholder={`Enter ${variable.label.toLowerCase()}...`}
              />
            )}

            {/* Number input */}
            {variable.type === 'number' && (
              <Input
                id={variable.name}
                type="number"
                value={(value as number) ?? ''}
                onChange={(e) => {
                  const numValue = Number.parseInt(e.target.value, 10);
                  onChange(variable.name, Number.isNaN(numValue) ? '' : numValue);
                }}
                placeholder={`Enter ${variable.label.toLowerCase()}...`}
              />
            )}

            {/* Dropdown select */}
            {variable.type === 'dropdown' &&
              variable.options &&
              (() => {
                // Find the label for the currently selected value
                const currentValue = (value as string) || '';
                const selectedOption = variable.options?.find((opt) => {
                  const optValue = typeof opt === 'string' ? opt : opt.value;
                  return optValue === currentValue;
                });
                const displayLabel = selectedOption
                  ? typeof selectedOption === 'string'
                    ? selectedOption
                    : selectedOption.label
                  : undefined;

                return (
                  <Select
                    value={currentValue}
                    onValueChange={(newValue) => onChange(variable.name, newValue === '__NOTHING__' ? '' : newValue)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={`Select ${variable.label.toLowerCase()}...`}>{displayLabel}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {!variable.required && (
                        <SelectItem value="__NOTHING__">
                          <span className="text-muted-foreground italic">None (skip)</span>
                        </SelectItem>
                      )}
                      {variable.options?.map((option) => {
                        // Skip invalid or disabled options
                        if (typeof option === 'string') {
                          if (!option.trim()) return null;
                        } else {
                          if (!option?.value?.trim()) return null;
                          if (option.enabled === false) return null;
                        }

                        const optionValue = typeof option === 'string' ? option : option.value;
                        const optionLabel = typeof option === 'string' ? option : option.label;

                        return (
                          <SelectItem
                            key={`${variable.name}-option-${optionValue}`}
                            value={optionValue}
                          >
                            {optionLabel}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                );
              })()}

            {/* Boolean checkbox */}
            {variable.type === 'boolean' && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id={variable.name}
                  checked={(value as boolean) || false}
                  onCheckedChange={(checked) => onChange(variable.name, checked)}
                />
                <Label
                  htmlFor={variable.name}
                  className="text-sm"
                >
                  {variable.label}
                  {variable.required && <span className="text-destructive ml-1">*</span>}
                </Label>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export type { TemplateVariable };
