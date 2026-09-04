import { useNavigate } from '@tanstack/react-router';
import { Loader2, Settings2 } from 'lucide-react';
import { useState } from 'react';
import { DropdownOptionsEditor } from '@/components/admin/template-variable-editor';
import { normalizeOption } from '@/components/admin/utils/option-utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import {
  type FormConfigWithSchema,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormSubscribe,
  FormWithSchema,
  useFormContext,
  useFormWatch,
} from '@/components/ui/tanstack-form';
import { Textarea } from '@/components/ui/textarea';
import type { globalVariable } from '@/db/schema/ai';
import { useAppMutation } from '@/hooks/use-app-mutation';
import { queryKeys } from '@/libs/query-keys';
import { type GlobalVariableFormData, globalVariableFormSchema } from '@/schemas/admin/global-variable-schema';
import { createGlobalVariable, updateGlobalVariable } from '@/server/fns/admin/global-variables';
import styles from './global-variable-form.module.css';

type GlobalVariable = typeof globalVariable.$inferSelect;
type FormValues = GlobalVariableFormData;

interface GlobalVariableFormProps {
  initialData?: GlobalVariable;
  mode: 'create' | 'edit';
}

// Extracted dropdown options component that uses form context
function DropdownOptionsSection({
  isSheetOpen,
  setIsSheetOpen,
  focusOptionIndex,
  setFocusOptionIndex,
  handleBadgeClick,
}: {
  isSheetOpen: boolean;
  setIsSheetOpen: (open: boolean) => void;
  focusOptionIndex: number | null;
  setFocusOptionIndex: (index: number | null) => void;
  handleBadgeClick: (index: number) => void;
}) {
  const { form } = useFormContext();
  const options = useFormWatch('options') || [];

  return (
    <div className={styles.optionsSection}>
      <div className={styles.optionsHead}>
        <div>
          <h3 className={styles.optionsTitle}>Dropdown Options</h3>
          <p className={styles.optionsCount}>{options.length} options configured</p>
        </div>
        <Sheet
          open={isSheetOpen}
          onOpenChange={setIsSheetOpen}
        >
          <SheetTrigger>
            <Button
              variant="outline"
              size="sm"
              type="button"
            >
              <Settings2 />
              Manage Options
            </Button>
          </SheetTrigger>
          <SheetContent className={styles.sheet}>
            <SheetHeader>
              <SheetTitle>Manage Options</SheetTitle>
              <SheetDescription>Add, remove, and configure dropdown options.</SheetDescription>
            </SheetHeader>
            <div className="margin-top-6">
              <DropdownOptionsEditor
                options={options}
                onChange={(opts) => form.setFieldValue('options', opts)}
                focusOptionIndex={focusOptionIndex}
                onFocusComplete={() => setFocusOptionIndex(null)}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Quick preview of options */}
      <div className="cluster space-2">
        {options.map((opt: any, i: number) => {
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
  );
}

// Component that conditionally renders default value field based on type
function DefaultValueField() {
  const type = useFormWatch('type');

  if (type === 'dropdown' || type === 'boolean') {
    return null;
  }

  return (
    <FormField
      name="defaultValue"
      renderFieldAction={({ value, onChange, onBlur }) => (
        <FormItem>
          <FormLabel>Default Value</FormLabel>
          <FormControl>
            <Input
              value={value ?? ''}
              onChange={(e) => onChange(e.target.value)}
              onBlur={onBlur}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

// Component that conditionally renders dropdown options based on type
function ConditionalDropdownOptions(props: {
  isSheetOpen: boolean;
  setIsSheetOpen: (open: boolean) => void;
  focusOptionIndex: number | null;
  setFocusOptionIndex: (index: number | null) => void;
  handleBadgeClick: (index: number) => void;
}) {
  const type = useFormWatch('type');

  if (type !== 'dropdown') {
    return null;
  }

  return <DropdownOptionsSection {...props} />;
}

export function GlobalVariableForm({ initialData, mode }: GlobalVariableFormProps) {
  const navigate = useNavigate();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [focusOptionIndex, setFocusOptionIndex] = useState<number | null>(null);

  const { mutate: createVariable, isPending: isCreating } = useAppMutation(createGlobalVariable, {
    invalidates: [queryKeys.adminGlobalVars.withUsage, queryKeys.adminGlobalVars.all],
    successMessage: 'Variable created',
    errorMessage: 'Failed to create variable',
    onSuccess: () => {
      navigate({ to: '/admin/global-variables' });
    },
  });

  const { mutate: updateVariable, isPending: isUpdating } = useAppMutation(updateGlobalVariable, {
    invalidates: initialData
      ? [queryKeys.adminGlobalVars.withUsage, queryKeys.adminGlobalVars.all, queryKeys.adminGlobalVars.detail(initialData.id)]
      : [queryKeys.adminGlobalVars.withUsage, queryKeys.adminGlobalVars.all],
    successMessage: 'Variable updated',
    errorMessage: 'Failed to update variable',
    onSuccess: () => {
      navigate({ to: '/admin/global-variables' });
    },
  });

  const isPending = isCreating || isUpdating;

  const handleBadgeClick = (optionIndex: number) => {
    setFocusOptionIndex(optionIndex);
    setIsSheetOpen(true);
  };

  const onSubmit = (values: FormValues) => {
    if (mode === 'create') {
      createVariable(values);
      return;
    }

    updateVariable({ ...values, id: initialData!.id });
  };

  const formConfig: FormConfigWithSchema<typeof globalVariableFormSchema> = {
    schema: globalVariableFormSchema,
    defaultValues: {
      name: initialData?.name || '',
      label: initialData?.label || '',
      type: (initialData?.type as any) || 'text',
      description: initialData?.description || '',
      defaultValue: initialData?.defaultValue || '',
      options: initialData?.options ? JSON.parse(JSON.stringify(initialData.options)) : [],
      required: initialData?.required || false,
    },
    onSubmit,
  };

  return (
    <FormWithSchema
      config={formConfig}
      className={`${styles.form} stack space-8`}
    >
      <Card>
        <CardHeader>
          <CardTitle>{mode === 'create' ? 'Create Global Variable' : 'Edit Global Variable'}</CardTitle>
          <CardDescription>Define a variable that can be reused across multiple templates.</CardDescription>
        </CardHeader>
        <CardContent className="stack space-6">
          <div className={styles.pair}>
            <FormField
              name="name"
              renderFieldAction={({ value, onChange, onBlur }) => (
                <FormItem>
                  <FormLabel>Variable Name (ID)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. clothing_style"
                      value={value ?? ''}
                      onChange={(e) => onChange(e.target.value)}
                      onBlur={onBlur}
                    />
                  </FormControl>
                  <FormDescription>Used in prompts as {'{variable_name}'}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              name="label"
              renderFieldAction={({ value, onChange, onBlur }) => (
                <FormItem>
                  <FormLabel>Display Label</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Clothing Style"
                      value={value ?? ''}
                      onChange={(e) => onChange(e.target.value)}
                      onBlur={onBlur}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            name="description"
            renderFieldAction={({ value, onChange, onBlur }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Describe this variable..."
                    value={value ?? ''}
                    onChange={(e) => onChange(e.target.value)}
                    onBlur={onBlur}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className={styles.pair}>
            <FormField
              name="type"
              renderFieldAction={({ value, onChange }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select
                    onValueChange={onChange}
                    defaultValue={value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="text">Text</SelectItem>
                      <SelectItem value="number">Number</SelectItem>
                      <SelectItem value="dropdown">Dropdown</SelectItem>
                      <SelectItem value="boolean">Boolean</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              name="required"
              renderFieldAction={({ value, onChange }) => (
                <FormItem className={styles.switchField}>
                  <div className={styles.switchText}>
                    <FormLabel className={styles.switchLabel}>Required</FormLabel>
                  </div>
                  <FormControl>
                    <Switch
                      checked={Boolean(value)}
                      onCheckedChange={onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          {/* Dropdown Options Editor - conditionally rendered */}
          <ConditionalDropdownOptions
            isSheetOpen={isSheetOpen}
            setIsSheetOpen={setIsSheetOpen}
            focusOptionIndex={focusOptionIndex}
            setFocusOptionIndex={setFocusOptionIndex}
            handleBadgeClick={handleBadgeClick}
          />

          {/* Default Value - conditionally rendered */}
          <DefaultValueField />

          <div className={styles.actions}>
            <FormSubscribe
              selectorAction={(state: any) => ({
                canSubmit: state.canSubmit,
                isSubmitting: state.isSubmitting,
                isValid: state.isValid,
              })}
              renderAction={({ canSubmit, isSubmitting, isValid }: { canSubmit: boolean; isSubmitting: boolean; isValid: boolean }) => {
                const isBusy = isPending || isSubmitting;

                return (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => window.history.back()}
                      disabled={isBusy}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={isBusy || !canSubmit || !isValid}
                    >
                      {isBusy && <Loader2 className={styles.buttonSpinner} />}
                      {mode === 'create' ? 'Create Variable' : 'Save Changes'}
                    </Button>
                  </>
                );
              }}
            />
          </div>
        </CardContent>
      </Card>
    </FormWithSchema>
  );
}
