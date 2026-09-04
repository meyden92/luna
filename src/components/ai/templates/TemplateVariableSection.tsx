import { CheckCircle2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { TemplateVariable } from '@/types/template';
import styles from './TemplateVariableSection.module.css';

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
    <div className="stack space-4">
      <div className={styles.header}>
        <Label className="weight-semibold">Template Options</Label>
        {requiredVariables.length > 0 && (
          <div className={styles.status}>
            {allRequiredFieldsFilled ? (
              <span className={styles.statusDone}>
                <CheckCircle2 className={styles.statusIcon} />
                All required
              </span>
            ) : (
              <span>
                <span className={styles.statusCount}>{requiredFieldsRemaining}</span> required
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
            className="stack space-2"
          >
            {variable.type !== 'boolean' && (
              <Label htmlFor={variable.name}>
                {variable.label}
                {variable.required && <span className={styles.marker}>*</span>}
              </Label>
            )}

            {variable.description && <p className={styles.description}>{variable.description}</p>}

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
                          <span className={styles.placeholderOption}>None (skip)</span>
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
              <div className={styles.checkboxRow}>
                <Checkbox
                  id={variable.name}
                  checked={(value as boolean) || false}
                  onCheckedChange={(checked) => onChange(variable.name, checked)}
                />
                <Label htmlFor={variable.name}>
                  {variable.label}
                  {variable.required && <span className={styles.marker}>*</span>}
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
