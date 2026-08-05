import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Link as LinkIcon,
  MoreHorizontal,
  Plus,
  Settings2,
  X,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { PreviewIcon } from '@/components/ui/image-preview';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { validateTemplateVariablesInPrompt } from '@/libs/template-variable-validation';
import type { listGlobalVariables } from '@/server/fns/admin/global-variables';
import type { TemplateVariable, TemplateVariableOption } from '@/types/template';
import { normalizeOption } from './utils/option-utils';

// Re-export types for compatibility
export type { TemplateVariable, TemplateVariableOption };

export type GlobalVariable = Awaited<ReturnType<typeof listGlobalVariables>>[number];

interface TemplateVariableEditorProps {
  variables: TemplateVariable[];
  onChange: (variables: TemplateVariable[]) => void;
  mode?: 'create' | 'edit';
  prompt?: string;
}

export function TemplateVariableEditor({
  variables,
  onChange,
  mode,
  prompt = '',
  globalVariables = [],
}: TemplateVariableEditorProps & { globalVariables?: GlobalVariable[] }) {
  const baseId = useId();
  const { unused, missing, invalidDropdowns } = useTemplateValidation(variables, prompt);

  const addVariable = () => {
    const newVariable: TemplateVariable = {
      id: `var-${Date.now()}`,
      name: '',
      label: '',
      type: 'text',
      required: false,
      enabled: true,
    };
    onChange([...variables, newVariable]);
  };

  const addGlobalVariable = (globalVar: GlobalVariable) => {
    // Check if already added
    if (variables.some((v) => v.globalVariableId === globalVar.id)) {
      return;
    }

    const newVariable: TemplateVariable = {
      id: `var-${Date.now()}`,
      name: globalVar.name,
      label: globalVar.label,
      type: globalVar.type as TemplateVariable['type'],
      required: globalVar.required,
      enabled: true,
      globalVariableId: globalVar.id,
      options: globalVar.options ? JSON.parse(JSON.stringify(globalVar.options)) : undefined,
      defaultValue: globalVar.defaultValue || undefined,
      description: globalVar.description || undefined,
    };
    onChange([...variables, newVariable]);
  };

  const removeVariable = (index: number) => {
    onChange(variables.filter((_, i) => i !== index));
  };

  const updateVariable = (index: number, field: keyof TemplateVariable, value: any) => {
    const updatedVariables = variables.map((variable, i) => {
      if (i === index) {
        // If global, prevent editing core fields
        if (variable.globalVariableId && ['name', 'type'].includes(field as string)) {
          return variable;
        }

        const updatedVariable = { ...variable, [field]: value };
        // Default name/label for dropdowns
        if (field === 'type' && value === 'dropdown') {
          if (!updatedVariable.name) updatedVariable.name = 'dropdown_selection';
          if (!updatedVariable.label) updatedVariable.label = 'Dropdown Selection';
          if (!updatedVariable.options) updatedVariable.options = [];
        }
        return updatedVariable;
      }
      return variable;
    });
    onChange(updatedVariables);
  };

  const moveVariable = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= variables.length) return;
    const updatedVariables = [...variables];
    const [movedItem] = updatedVariables.splice(fromIndex, 1);
    if (movedItem) {
      updatedVariables.splice(toIndex, 0, movedItem);
      onChange(updatedVariables);
    }
  };

  const enabledVariablesCount = variables.filter((v) => v.enabled !== false).length;
  const hasValidationIssues = missing.length > 0 || invalidDropdowns.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Label className="text-base font-medium">Template Variables</Label>
          {variables.length > 0 && (
            <Badge
              variant="outline"
              className="text-xs"
            >
              {enabledVariablesCount} active
            </Badge>
          )}
          {hasValidationIssues && (
            <Badge
              variant="destructive"
              className="text-xs"
            >
              <AlertCircle className="w-3 h-3 mr-1" />
              Issues
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          {globalVariables && globalVariables.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger>
                <LinkIcon className="w-4 h-4 mr-2" />
                Link Global
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {globalVariables.map((gv) => (
                  <DropdownMenuItem
                    key={gv.id}
                    onClick={() => addGlobalVariable(gv)}
                    disabled={variables.some((v) => v.globalVariableId === gv.id)}
                  >
                    {gv.label} ({gv.name})
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button
            onClick={addVariable}
            variant="outline"
            size="sm"
            type="button"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Variable
          </Button>
        </div>
      </div>

      {variables.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed rounded-lg bg-muted/10">
          <p className="text-muted-foreground mb-2">No variables defined</p>
          <div className="flex justify-center gap-2">
            <Button
              onClick={addVariable}
              variant="secondary"
              size="sm"
              type="button"
            >
              Create custom variable
            </Button>
            {globalVariables && globalVariables.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger>Link global variable</DropdownMenuTrigger>
                <DropdownMenuContent>
                  {globalVariables.map((gv) => (
                    <DropdownMenuItem
                      key={gv.id}
                      onClick={() => addGlobalVariable(gv)}
                      disabled={variables.some((v) => v.globalVariableId === gv.id)}
                    >
                      {gv.label} ({gv.name})
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {variables.map((variable, index) => {
            const isUsed = !unused.includes(variable.name) && !missing.includes(variable.name) && variable.name.trim() !== '';
            const isUnused = unused.includes(variable.name);
            const isInvalid = invalidDropdowns.includes(variable.name);

            return (
              <VariableItem
                key={variable.id || `${baseId}-${index}`}
                variable={variable}
                index={index}
                isLast={index === variables.length - 1}
                onUpdate={(field, value) => updateVariable(index, field, value)}
                onRemove={() => removeVariable(index)}
                onMoveUp={() => moveVariable(index, index - 1)}
                onMoveDown={() => moveVariable(index, index + 1)}
                mode={mode}
                isUsed={isUsed}
                isUnused={isUnused}
                isInvalid={isInvalid}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

interface VariableItemProps {
  variable: TemplateVariable;
  index: number;
  isLast: boolean;
  onUpdate: (field: keyof TemplateVariable, value: any) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  mode?: 'create' | 'edit';
  isUsed?: boolean;
  isUnused?: boolean;
  isInvalid?: boolean;
}

function VariableItem({
  variable,
  index,
  isLast,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  mode,
  isUsed,
  isUnused,
  isInvalid,
}: VariableItemProps) {
  const [isExpanded, setIsExpanded] = useState(mode === 'create');
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [focusOptionIndex, setFocusOptionIndex] = useState<number | null>(null);

  const handleBadgeClick = (optionIndex: number) => {
    setFocusOptionIndex(optionIndex);
    setIsSheetOpen(true);
  };

  return (
    <div className="border rounded-lg bg-card shadow-sm transition-all hover:shadow-md">
      <div className="flex items-center gap-3 p-3 border-b bg-muted/30">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 text-muted-foreground cursor-grab active:cursor-grabbing"
          type="button"
        >
          <GripVertical className="h-4 w-4" />
        </Button>

        <div className="flex-1 flex items-center gap-3 min-w-0">
          <span className="font-mono text-xs bg-muted px-2 py-1 rounded border shrink-0">{variable.name || 'unnamed'}</span>
          <span className="font-medium truncate">{variable.label || 'No Label'}</span>
          <div className="flex gap-1 flex-wrap">
            <Badge
              variant="outline"
              className="text-[10px] uppercase"
            >
              {variable.type}
            </Badge>
            {variable.globalVariableId && (
              <Badge
                variant="secondary"
                className="text-[10px] bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800"
              >
                Global
              </Badge>
            )}
            {variable.required && (
              <Badge
                variant="secondary"
                className="text-[10px]"
              >
                Required
              </Badge>
            )}
            {variable.enabled === false && (
              <Badge
                variant="destructive"
                className="text-[10px]"
              >
                Disabled
              </Badge>
            )}
            {isUsed && variable.name.trim() !== '' && (
              <Badge
                variant="outline"
                className="text-[10px] bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-800"
              >
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Used
              </Badge>
            )}
            {isUnused && (
              <div title="This variable is defined but not used in the prompt text">
                <Badge
                  variant="outline"
                  className="text-[10px] bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-400 dark:border-yellow-800 cursor-help"
                >
                  <AlertCircle className="w-3 h-3 mr-1" />
                  Unused
                </Badge>
              </div>
            )}
            {isInvalid && (
              <Badge
                variant="destructive"
                className="text-[10px]"
              >
                <AlertCircle className="w-3 h-3 mr-1" />
                Invalid
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setIsExpanded(!isExpanded)}
            type="button"
          >
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger>
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={onMoveUp}
                disabled={index === 0}
              >
                Move Up
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onMoveDown}
                disabled={isLast}
              >
                Move Down
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={onRemove}
              >
                Delete Variable
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {isExpanded && (
        <div className="p-4 space-y-6 animate-in slide-in-from-top-2 duration-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Variable Name (ID)</Label>
                {variable.globalVariableId && (
                  <Badge
                    variant="secondary"
                    className="text-[10px] h-5"
                  >
                    Global
                  </Badge>
                )}
              </div>
              <Input
                value={variable.name}
                onChange={(e) => onUpdate('name', e.target.value)}
                placeholder="e.g., product_name"
                className="font-mono"
                disabled={!!variable.globalVariableId}
              />
              <p className="text-xs text-muted-foreground">Used in prompt as {'{variable_name}'}</p>
            </div>
            <div className="space-y-2">
              <Label>Display Label</Label>
              <Input
                value={variable.label}
                onChange={(e) => onUpdate('label', e.target.value)}
                placeholder="e.g., Product Name"
                disabled={!!variable.globalVariableId}
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={variable.type}
                onValueChange={(value) => onUpdate('type', value)}
                disabled={!!variable.globalVariableId}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="number">Number</SelectItem>
                  <SelectItem value="dropdown">Dropdown</SelectItem>
                  <SelectItem value="boolean">Boolean</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-3 pt-8">
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`req-${variable.id}`}
                  checked={variable.required}
                  onCheckedChange={(c) => onUpdate('required', c)}
                />
                <Label htmlFor={`req-${variable.id}`}>Required field</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`en-${variable.id}`}
                  checked={variable.enabled !== false}
                  onCheckedChange={(c) => onUpdate('enabled', c)}
                />
                <Label htmlFor={`en-${variable.id}`}>Enabled</Label>
              </div>
            </div>
          </div>

          {variable.type === 'dropdown' && (
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="text-sm font-medium">Dropdown Options</h4>
                  <p className="text-xs text-muted-foreground">{variable.options?.length || 0} options configured</p>
                </div>
                <Sheet
                  open={isSheetOpen}
                  onOpenChange={setIsSheetOpen}
                >
                  <SheetTrigger>
                    <Settings2 className="w-4 h-4 mr-2" />
                    Manage Options
                  </SheetTrigger>
                  <SheetContent className="w-full sm:max-w-[50vw] overflow-y-auto">
                    <SheetHeader>
                      <SheetTitle>Manage Options for "{variable.label}"</SheetTitle>
                      <SheetDescription>Add, remove, and configure dropdown options.</SheetDescription>
                    </SheetHeader>
                    <div className="mt-6">
                      <DropdownOptionsEditor
                        options={variable.options || []}
                        onChange={(opts) => onUpdate('options', opts)}
                        focusOptionIndex={focusOptionIndex}
                        onFocusComplete={() => setFocusOptionIndex(null)}
                      />
                    </div>
                  </SheetContent>
                </Sheet>
              </div>

              {/* Quick preview of options */}
              <div className="flex flex-wrap gap-2">
                {variable.options?.map((opt, i) => {
                  const n = normalizeOption(opt);
                  return (
                    <Badge
                      // biome-ignore lint/suspicious/noArrayIndexKey: Options order is stable enough for preview
                      key={i}
                      variant="secondary"
                      className="font-normal cursor-pointer hover:bg-secondary/80 transition-colors"
                      onClick={() => handleBadgeClick(i)}
                    >
                      {n.label}
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}

          <div className="border-t pt-4">
            <Label className="mb-2 block">Preview Image (Optional)</Label>
            <div className="flex gap-4">
              <Input
                value={variable.previewUrl || ''}
                onChange={(e) => onUpdate('previewUrl', e.target.value)}
                placeholder="https://..."
                className="flex-1"
              />
              <PreviewIcon previewUrl={variable.previewUrl} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface DropdownOptionsEditorProps {
  options: (string | TemplateVariableOption)[];
  onChange: (options: TemplateVariableOption[]) => void;
  focusOptionIndex?: number | null;
  onFocusComplete?: () => void;
}

export function DropdownOptionsEditor({ options, onChange, focusOptionIndex, onFocusComplete }: DropdownOptionsEditorProps) {
  const normalizedOptions = options.map(normalizeOption);
  const labelInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (focusOptionIndex !== null && focusOptionIndex !== undefined) {
      const inputElement = labelInputRefs.current[focusOptionIndex];
      if (inputElement) {
        setTimeout(() => {
          inputElement.focus();
          inputElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          onFocusComplete?.();
        }, 100);
      }
    }
  }, [focusOptionIndex, onFocusComplete]);

  const addOption = () => {
    onChange([...normalizedOptions, { label: '', value: '', enabled: true }]);
  };

  const updateOption = (index: number, field: keyof TemplateVariableOption, value: any) => {
    const newOptions = [...normalizedOptions];
    newOptions[index] = { ...newOptions[index], [field]: value } as TemplateVariableOption;
    onChange(newOptions);
  };

  const removeOption = (index: number) => {
    onChange(normalizedOptions.filter((_, i) => i !== index));
  };

  const duplicateOption = (index: number) => {
    const optionToDuplicate = normalizedOptions[index];
    if (optionToDuplicate) {
      const duplicated = {
        ...optionToDuplicate,
        label: `${optionToDuplicate.label} (Copy)`,
      };
      const newOptions = [...normalizedOptions];
      newOptions.splice(index + 1, 0, duplicated);
      onChange(newOptions);
    }
  };

  const moveOption = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= normalizedOptions.length) return;
    const newOptions = [...normalizedOptions];
    const [movedItem] = newOptions.splice(fromIndex, 1);
    if (movedItem) {
      newOptions.splice(toIndex, 0, movedItem);
      onChange(newOptions);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-2">
        <Label className="text-sm font-medium">Options Configuration</Label>
        <Badge
          variant="outline"
          className="text-xs"
        >
          {normalizedOptions.length} option{normalizedOptions.length !== 1 ? 's' : ''}
        </Badge>
      </div>
      <div className="space-y-4">
        {normalizedOptions.map((option, index) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: No stable ID available for options
            key={index}
            className="flex gap-3 p-4 border rounded-lg bg-card relative group"
          >
            <div className="flex flex-col gap-1 pt-1">
              <button
                type="button"
                onClick={() => moveOption(index, index - 1)}
                disabled={index === 0}
                className="p-1 hover:bg-accent rounded disabled:opacity-30 disabled:cursor-not-allowed"
                title="Move up"
              >
                <ChevronDown className="w-3.5 h-3.5 rotate-180" />
              </button>
              <GripVertical className="w-4 h-4 text-muted-foreground cursor-move" />
              <button
                type="button"
                onClick={() => moveOption(index, index + 1)}
                disabled={index === normalizedOptions.length - 1}
                className="p-1 hover:bg-accent rounded disabled:opacity-30 disabled:cursor-not-allowed"
                title="Move down"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 space-y-4">
              <div className="flex items-center justify-between">
                <Badge
                  variant="secondary"
                  className="text-[10px]"
                >
                  Option {index + 1}
                </Badge>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => duplicateOption(index)}
                    type="button"
                    title="Duplicate"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    onClick={() => removeOption(index)}
                    type="button"
                    title="Delete"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">Label</Label>
                  <Input
                    ref={(el) => {
                      labelInputRefs.current[index] = el;
                    }}
                    value={option.label}
                    onChange={(e) => updateOption(index, 'label', e.target.value)}
                    placeholder="Display Label"
                    className="h-8"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Value</Label>
                  <Textarea
                    value={option.value}
                    onChange={(e) => updateOption(index, 'value', e.target.value)}
                    placeholder="Prompt Value"
                    className="min-h-[60px] resize-y font-mono text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id={`opt-en-${index}`}
                  checked={option.enabled !== false}
                  onCheckedChange={(c) => updateOption(index, 'enabled', c)}
                />
                <Label
                  htmlFor={`opt-en-${index}`}
                  className="text-xs font-normal"
                >
                  Enabled
                </Label>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Preview Image URL</Label>
                <div className="flex gap-2">
                  <Input
                    value={option.previewUrl || ''}
                    onChange={(e) => updateOption(index, 'previewUrl', e.target.value)}
                    placeholder="https://..."
                    className="h-8 flex-1"
                  />
                  <PreviewIcon
                    previewUrl={option.previewUrl}
                    size="small"
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Button
        onClick={addOption}
        className="w-full"
        variant="outline"
        type="button"
      >
        <Plus className="w-4 h-4 mr-2" />
        Add Option
      </Button>
    </div>
  );
}

export function useTemplateValidation(variables: TemplateVariable[], prompt: string) {
  return useMemo(() => validateTemplateVariablesInPrompt(variables, prompt), [variables, prompt]);
}
