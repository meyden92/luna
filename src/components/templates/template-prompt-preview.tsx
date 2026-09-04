import { ChevronDown, ChevronUp, Copy, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/libs/utils';
import type { TemplateVariable, TemplateVariableOption } from '@/types/template';
import styles from './template-prompt-preview.module.css';

interface TemplatePromptPreviewProps {
  prompt: string;
  variables: TemplateVariable[];
}

const normalizeOption = (option: string | TemplateVariableOption): TemplateVariableOption => {
  if (typeof option === 'string') {
    return { label: option, value: option, enabled: true };
  }
  return {
    ...option,
    enabled: option.enabled !== false,
  };
};

const getInitialTestValues = (variables: TemplateVariable[]): Record<string, string> => {
  const initialValues: Record<string, string> = {};

  for (const variable of variables) {
    if (variable.enabled === false) continue;

    if (variable.defaultValue) {
      initialValues[variable.name] = variable.defaultValue;
    } else if (variable.type === 'dropdown' && variable.options && variable.options.length > 0) {
      const firstOptionRaw = variable.options[0];
      if (firstOptionRaw) {
        const firstOption = normalizeOption(firstOptionRaw);
        if (firstOption.enabled !== false) {
          initialValues[variable.name] = firstOption.value;
        }
      }
    } else if (variable.type === 'boolean') {
      initialValues[variable.name] = 'false';
    } else {
      initialValues[variable.name] = '';
    }
  }

  return initialValues;
};

export function TemplatePromptPreview({ prompt, variables }: TemplatePromptPreviewProps) {
  const [testValues, setTestValues] = useState<Record<string, string>>({});
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    setTestValues(getInitialTestValues(variables));
  }, [variables]);

  const handleValueChange = (variableName: string, value: string | null) => {
    if (value === null) return;
    setTestValues((prev) => ({ ...prev, [variableName]: value }));
  };

  const handleReset = () => {
    setTestValues(getInitialTestValues(variables));
  };

  const previewPrompt = useMemo(() => {
    let previewPrompt = prompt;
    for (const variable of variables) {
      if (variable.enabled === false) continue;
      const value = testValues[variable.name] || '';
      previewPrompt = previewPrompt.replaceAll(`{${variable.name}}`, value);
    }
    return previewPrompt;
  }, [prompt, variables, testValues]);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(previewPrompt);
      toast.success('Prompt copied to clipboard');
    } catch {
      toast.error('Failed to copy prompt');
    }
  };

  const enabledVariables = useMemo(() => variables.filter((v) => v.enabled !== false && v.name.trim() !== ''), [variables]);

  if (enabledVariables.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <div className={styles.headerRow}>
          <div className={styles.headerMain}>
            <div className={styles.titleRow}>
              <CardTitle>Prompt Preview</CardTitle>
              <Button
                onClick={() => setIsExpanded(!isExpanded)}
                variant="ghost"
                size="sm"
                type="button"
                className={styles.toggleButton}
              >
                {isExpanded ? <ChevronUp className={styles.icon} /> : <ChevronDown className={styles.icon} />}
              </Button>
            </div>
            {isExpanded && <CardDescription>Test your template with different values to see the final prompt</CardDescription>}
          </div>
          {isExpanded && (
            <div className={styles.actions}>
              <Button
                onClick={handleReset}
                variant="outline"
                size="sm"
                type="button"
              >
                <RotateCcw className={styles.buttonIcon} />
                Reset
              </Button>
              <Button
                onClick={copyToClipboard}
                variant="outline"
                size="sm"
                type="button"
              >
                <Copy className={styles.buttonIcon} />
                Copy
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent className="stack space-6">
          <div className={styles.variableGrid}>
            {enabledVariables.map((variable) => (
              <div
                key={variable.id || variable.name}
                className="stack space-2"
              >
                <Label htmlFor={`preview-${variable.name}`}>
                  {variable.label}
                  {variable.required && <span className={styles.required}>*</span>}
                </Label>

                {variable.type === 'text' ? (
                  <Input
                    id={`preview-${variable.name}`}
                    value={testValues[variable.name] || ''}
                    onChange={(e) => handleValueChange(variable.name, e.target.value)}
                    placeholder={variable.description || variable.label}
                  />
                ) : variable.type === 'number' ? (
                  <Input
                    id={`preview-${variable.name}`}
                    type="number"
                    value={testValues[variable.name] || ''}
                    onChange={(e) => handleValueChange(variable.name, e.target.value)}
                    placeholder={variable.description || variable.label}
                  />
                ) : variable.type === 'dropdown' && variable.options ? (
                  <Select
                    value={testValues[variable.name] || ''}
                    onValueChange={(value) => handleValueChange(variable.name, value)}
                  >
                    <SelectTrigger id={`preview-${variable.name}`}>
                      <SelectValue placeholder={`Select ${variable.label}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {variable.options.map((option) => {
                        const normalizedOption = normalizeOption(option);
                        if (normalizedOption.enabled === false) return null;
                        return (
                          <SelectItem
                            key={`${variable.name}-${normalizedOption.value}`}
                            value={normalizedOption.value}
                          >
                            {normalizedOption.label}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                ) : variable.type === 'boolean' ? (
                  <div className={styles.switchRow}>
                    <Switch
                      id={`preview-${variable.name}`}
                      checked={testValues[variable.name] === 'true'}
                      onCheckedChange={(checked) => handleValueChange(variable.name, checked ? 'true' : 'false')}
                    />
                    <Label
                      htmlFor={`preview-${variable.name}`}
                      className={cn('type-sm', styles.switchLabel)}
                    >
                      {testValues[variable.name] === 'true' ? 'Enabled' : 'Disabled'}
                    </Label>
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <div className={cn('stack space-2', styles.finalSection)}>
            <Label>Final Prompt</Label>
            <Textarea
              value={previewPrompt}
              readOnly
              className={styles.preview}
            />
          </div>
        </CardContent>
      )}
    </Card>
  );
}
