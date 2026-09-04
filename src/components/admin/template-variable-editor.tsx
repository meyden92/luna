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
import styles from './template-variable-editor.module.css';
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
    <div className="stack space-4">
      <div className={styles.header}>
        <div className="cluster space-2">
          <Label className={styles.heading}>Template Variables</Label>
          {variables.length > 0 && <Badge variant="outline">{enabledVariablesCount} active</Badge>}
          {hasValidationIssues && (
            <Badge variant="destructive">
              <AlertCircle />
              Issues
            </Badge>
          )}
        </div>
        <div className="cluster space-2">
          {globalVariables && globalVariables.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger>
                <LinkIcon />
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
            <Plus />
            Add Variable
          </Button>
        </div>
      </div>

      {variables.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyText}>No variables defined</p>
          <div className={styles.emptyActions}>
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
        <div className="stack space-3">
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
    <div className={styles.item}>
      <div className={styles.itemHead}>
        <Button
          variant="ghost"
          size="icon-xs"
          className={styles.grip}
          type="button"
        >
          <GripVertical />
        </Button>

        <div className={styles.itemTitle}>
          <span className={styles.varName}>{variable.name || 'unnamed'}</span>
          <span className="weight-medium type-truncate">{variable.label || 'No Label'}</span>
          <div className="cluster space-1">
            <Badge
              variant="outline"
              className={styles.typeBadge}
            >
              {variable.type}
            </Badge>
            {variable.globalVariableId && (
              <Badge
                variant="outline"
                className={styles.toneBadge}
                data-tone="global"
              >
                Global
              </Badge>
            )}
            {variable.required && <Badge variant="secondary">Required</Badge>}
            {variable.enabled === false && <Badge variant="destructive">Disabled</Badge>}
            {isUsed && variable.name.trim() !== '' && (
              <Badge
                variant="outline"
                className={styles.toneBadge}
                data-tone="used"
              >
                <CheckCircle2 />
                Used
              </Badge>
            )}
            {isUnused && (
              <div title="This variable is defined but not used in the prompt text">
                <Badge
                  variant="outline"
                  className={styles.toneBadge}
                  data-tone="unused"
                >
                  <AlertCircle />
                  Unused
                </Badge>
              </div>
            )}
            {isInvalid && (
              <Badge variant="destructive">
                <AlertCircle />
                Invalid
              </Badge>
            )}
          </div>
        </div>

        <div className={styles.itemActions}>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setIsExpanded(!isExpanded)}
            type="button"
          >
            {isExpanded ? <ChevronDown /> : <ChevronRight />}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger>
              <MoreHorizontal />
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
                className={styles.destructiveItem}
                onClick={onRemove}
              >
                Delete Variable
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {isExpanded && (
        <div className={`${styles.body} stack space-6`}>
          <div className={styles.fields}>
            <div className="stack space-2">
              <div className={styles.fieldHead}>
                <Label>Variable Name (ID)</Label>
                {variable.globalVariableId && <Badge variant="secondary">Global</Badge>}
              </div>
              <Input
                value={variable.name}
                onChange={(e) => onUpdate('name', e.target.value)}
                placeholder="e.g., product_name"
                className={styles.mono}
                disabled={!!variable.globalVariableId}
              />
              <p className={styles.hint}>Used in prompt as {'{variable_name}'}</p>
            </div>
            <div className="stack space-2">
              <Label>Display Label</Label>
              <Input
                value={variable.label}
                onChange={(e) => onUpdate('label', e.target.value)}
                placeholder="e.g., Product Name"
                disabled={!!variable.globalVariableId}
              />
            </div>
            <div className="stack space-2">
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
            <div className={styles.toggles}>
              <div className={styles.toggle}>
                <Checkbox
                  id={`req-${variable.id}`}
                  checked={variable.required}
                  onCheckedChange={(c) => onUpdate('required', c)}
                />
                <Label htmlFor={`req-${variable.id}`}>Required field</Label>
              </div>
              <div className={styles.toggle}>
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
            <div className={styles.section}>
              <div className={styles.sectionHead}>
                <div>
                  <h4 className={styles.sectionTitle}>Dropdown Options</h4>
                  <p className={styles.hint}>{variable.options?.length || 0} options configured</p>
                </div>
                <Sheet
                  open={isSheetOpen}
                  onOpenChange={setIsSheetOpen}
                >
                  <SheetTrigger>
                    <Settings2 />
                    Manage Options
                  </SheetTrigger>
                  <SheetContent className={styles.sheet}>
                    <SheetHeader>
                      <SheetTitle>Manage Options for "{variable.label}"</SheetTitle>
                      <SheetDescription>Add, remove, and configure dropdown options.</SheetDescription>
                    </SheetHeader>
                    <div className="margin-top-6">
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
              <div className="cluster space-2">
                {variable.options?.map((opt, i) => {
                  const n = normalizeOption(opt);
                  return (
                    <Badge
                      // biome-ignore lint/suspicious/noArrayIndexKey: Options order is stable enough for preview
                      key={i}
                      variant="secondary"
                      className={styles.optionPreview}
                      onClick={() => handleBadgeClick(i)}
                    >
                      {n.label}
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}

          <div className={styles.section}>
            <Label className="margin-bottom-2">Preview Image (Optional)</Label>
            <div className={styles.previewRow}>
              <Input
                value={variable.previewUrl || ''}
                onChange={(e) => onUpdate('previewUrl', e.target.value)}
                placeholder="https://..."
                className={styles.previewInput}
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
    <div className="stack space-6">
      <div className={styles.optionsHead}>
        <Label className={styles.optionsHeading}>Options Configuration</Label>
        <Badge variant="outline">
          {normalizedOptions.length} option{normalizedOptions.length !== 1 ? 's' : ''}
        </Badge>
      </div>
      <div className="stack space-4">
        {normalizedOptions.map((option, index) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: No stable ID available for options
            key={index}
            className={styles.option}
          >
            <div className={styles.reorder}>
              <button
                type="button"
                onClick={() => moveOption(index, index - 1)}
                disabled={index === 0}
                className={styles.reorderButton}
                title="Move up"
              >
                <ChevronDown
                  className={styles.reorderIcon}
                  data-direction="up"
                />
              </button>
              <GripVertical className={styles.optionGrip} />
              <button
                type="button"
                onClick={() => moveOption(index, index + 1)}
                disabled={index === normalizedOptions.length - 1}
                className={styles.reorderButton}
                title="Move down"
              >
                <ChevronDown className={styles.reorderIcon} />
              </button>
            </div>

            <div className={styles.optionBody}>
              <div className={styles.optionHead}>
                <Badge variant="secondary">Option {index + 1}</Badge>
                <div className={styles.optionButtons}>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className={styles.iconButton}
                    onClick={() => duplicateOption(index)}
                    type="button"
                    title="Duplicate"
                  >
                    <Plus />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className={styles.iconButton}
                    data-tone="destructive"
                    onClick={() => removeOption(index)}
                    type="button"
                    title="Delete"
                  >
                    <X />
                  </Button>
                </div>
              </div>

              <div className={styles.optionFields}>
                <div className="stack space-2">
                  <Label className={styles.smallLabel}>Label</Label>
                  <Input
                    ref={(el) => {
                      labelInputRefs.current[index] = el;
                    }}
                    value={option.label}
                    onChange={(e) => updateOption(index, 'label', e.target.value)}
                    placeholder="Display Label"
                    className={styles.compactInput}
                  />
                </div>
                <div className="stack space-2">
                  <Label className={styles.smallLabel}>Value</Label>
                  <Textarea
                    value={option.value}
                    onChange={(e) => updateOption(index, 'value', e.target.value)}
                    placeholder="Prompt Value"
                    className={styles.valueArea}
                  />
                </div>
              </div>

              <div className={styles.toggle}>
                <Checkbox
                  id={`opt-en-${index}`}
                  checked={option.enabled !== false}
                  onCheckedChange={(c) => updateOption(index, 'enabled', c)}
                />
                <Label
                  htmlFor={`opt-en-${index}`}
                  className={styles.smallLabelNormal}
                >
                  Enabled
                </Label>
              </div>

              <div className="stack space-2">
                <Label className={styles.smallLabel}>Preview Image URL</Label>
                <div className={styles.urlRow}>
                  <Input
                    value={option.previewUrl || ''}
                    onChange={(e) => updateOption(index, 'previewUrl', e.target.value)}
                    placeholder="https://..."
                    className={styles.urlInput}
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
        className={styles.addOption}
        variant="outline"
        type="button"
      >
        <Plus />
        Add Option
      </Button>
    </div>
  );
}

export function useTemplateValidation(variables: TemplateVariable[], prompt: string) {
  return useMemo(() => validateTemplateVariablesInPrompt(variables, prompt), [variables, prompt]);
}
