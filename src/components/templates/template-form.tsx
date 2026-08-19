import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { type GlobalVariable, TemplateVariableEditor, useTemplateValidation } from '@/components/admin/template-variable-editor';
import { AutocompleteTextarea } from '@/components/templates/autocomplete-textarea';
import { TemplatePromptPreview } from '@/components/templates/template-prompt-preview';
import { TemplateTestGeneration } from '@/components/templates/template-test-generation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ImageUpload } from '@/components/ui/image-upload';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Form,
  type FormConfig,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useFormWatch,
} from '@/components/ui/tanstack-form';
import { Textarea } from '@/components/ui/textarea';
import type { editingModelField } from '@/db/schema/ai';
import { queryKeys } from '@/libs/query-keys';
import { validateTemplateVariablesInPrompt } from '@/libs/template-variable-validation';
import type { TemplateFormValues } from '@/schemas/template-schema';
import { createAdminTemplate, updateAdminTemplate } from '@/server/fns/admin/templates';

type EditingModelField = typeof editingModelField.$inferSelect;
interface TemplateFormProps {
  initialData?: Partial<TemplateFormValues> & { id?: string };
  mode: 'create' | 'edit';
  models: {
    id: string;
    label: string;
    fields: EditingModelField[];
  }[];
  globalVariables?: GlobalVariable[];
}

type FieldErrorMap = Record<string, string[]>;

// Read a File into a raw base64 string (without the data: URL prefix) for the server fn payload.
async function fileToBase64(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  return dataUrl.split(',')[1] ?? '';
}

function normalizeValidationErrors(errors: unknown): FieldErrorMap {
  if (!errors) {
    return {};
  }

  if (typeof errors === 'string') {
    return { form: [errors] };
  }

  if (typeof errors === 'object') {
    const entries = Object.entries(errors as Record<string, unknown>).map(([field, value]) => {
      if (Array.isArray(value)) {
        return [
          field,
          value.map((item) => (typeof item === 'string' ? item : String(item))).filter((item) => item.trim().length > 0),
        ] as const;
      }

      if (typeof value === 'string' && value.trim().length > 0) {
        return [field, [value]] as const;
      }

      return [field, []] as const;
    });

    return Object.fromEntries(entries.filter(([, messages]) => messages.length > 0));
  }

  return { form: ['Validation failed. Please review the form inputs.'] };
}

// Validation summary component that uses form context
function ValidationSummary() {
  const variables = useFormWatch('variables') || [];
  const prompt = useFormWatch('prompt') || '';

  const { unused, missing, invalidDropdowns } = useTemplateValidation(variables, prompt);

  const hasValidationIssues = missing.length > 0 || invalidDropdowns.length > 0;
  const hasWarnings = unused.length > 0;

  if (hasValidationIssues || hasWarnings) {
    return (
      <Card className={hasValidationIssues ? 'border-destructive' : 'border-yellow-500'}>
        <CardContent className="p-4">
          <div className="space-y-3">
            {hasValidationIssues && (
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
                <div className="flex-1 space-y-2">
                  <p className="font-semibold text-sm">Validation Issues</p>
                  {missing.length > 0 && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Undefined variables in prompt:</span>{' '}
                      <span className="font-mono text-destructive">{missing.join(', ')}</span>
                    </div>
                  )}
                  {invalidDropdowns.length > 0 && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Invalid dropdown configuration:</span>{' '}
                      <span className="font-mono text-destructive">{invalidDropdowns.join(', ')}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            {!hasValidationIssues && hasWarnings && (
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold text-sm">Warnings</p>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Unused variables:</span>{' '}
                    <span className="font-mono text-yellow-700">{unused.join(', ')}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (variables.length > 0 && prompt.trim() !== '') {
    return (
      <Card className="border-green-500 bg-green-50/50 dark:bg-green-950/20">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
            <p className="font-semibold text-sm text-green-900 dark:text-green-100">All variables are properly configured</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}

// Prompt field that watches variables
function PromptField() {
  const variables = useFormWatch('variables') || [];
  const { unused, missing } = useTemplateValidation(variables, useFormWatch('prompt') || '');

  return (
    <FormField
      name="prompt"
      renderFieldAction={({ value, onChange }) => (
        <FormItem>
          <FormLabel>Positive Prompt</FormLabel>
          <FormControl>
            <AutocompleteTextarea
              value={value ?? ''}
              onChange={onChange}
              variables={variables}
              placeholder="A cinematic shot of {subject} in {style} style... (Type '{' to see variables)"
              className="min-h-[120px] font-mono text-sm"
              expandDialogTitle="Edit Prompt"
            />
          </FormControl>
          <FormDescription>
            {missing.length > 0 && <span className="text-destructive block">Undefined variables in prompt: {missing.join(', ')}</span>}
            {unused.length > 0 && <span className="text-yellow-600 block">Unused variables: {unused.join(', ')}</span>}
          </FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

// Variables field that watches prompt
function VariablesField({ mode, globalVariables }: { mode: 'create' | 'edit'; globalVariables: GlobalVariable[] }) {
  const prompt = useFormWatch('prompt') || '';

  return (
    <FormField
      name="variables"
      renderFieldAction={({ value, onChange }) => (
        <FormItem>
          <FormControl>
            <TemplateVariableEditor
              variables={value || []}
              onChange={onChange}
              mode={mode}
              prompt={prompt}
              globalVariables={globalVariables}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

// Prompt preview component
function PromptPreviewSection() {
  const prompt = useFormWatch('prompt') || '';
  const variables = useFormWatch('variables') || [];

  return (
    <TemplatePromptPreview
      prompt={prompt}
      variables={variables}
    />
  );
}

// Dynamic model fields section
function ModelFieldsSection({ models }: { models: TemplateFormProps['models'] }) {
  const selectedModelId = useFormWatch('editingModelId');
  const selectedModel = models.find((m) => m.id === selectedModelId);

  if (!selectedModel?.fields || selectedModel.fields.length === 0) {
    return <p className="text-sm text-muted-foreground">No configurable settings for this model.</p>;
  }

  return (
    <>
      {selectedModel.fields.map((field) => (
        <FormField
          key={field.id}
          name={`editingModelFieldValues.${field.name}`}
          renderFieldAction={({ value, onChange }) => (
            <FormItem>
              <FormLabel>
                {field.label}
                {field.isRequired && <span className="text-destructive ml-1">*</span>}
              </FormLabel>
              <FormControl>
                {field.type === 'enum' && field.enumOptions ? (
                  <Select
                    onValueChange={onChange}
                    defaultValue={value || field.defaultValue || undefined}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={`Select ${field.label}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {field.enumOptions.split(',').map((option) => (
                        <SelectItem
                          key={option.trim()}
                          value={option.trim()}
                        >
                          {option.trim()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : field.type === 'boolean' ? (
                  <Switch
                    checked={value === 'true' || value === true}
                    onCheckedChange={(checked) => onChange(checked)}
                  />
                ) : field.isTextarea ? (
                  <Textarea
                    value={value ?? ''}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={field.description || ''}
                  />
                ) : (
                  <Input
                    type={field.type === 'number' ? 'number' : 'text'}
                    value={value ?? field.defaultValue ?? ''}
                    placeholder={field.description || ''}
                    onChange={(e) => {
                      const val = field.type === 'number' ? Number(e.target.value) : e.target.value;
                      onChange(val);
                    }}
                  />
                )}
              </FormControl>
              {field.description && <FormDescription>{field.description}</FormDescription>}
              <FormMessage />
            </FormItem>
          )}
        />
      ))}
    </>
  );
}

export function TemplateForm({ initialData, mode, models, globalVariables = [] }: TemplateFormProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap>({});

  const defaultValues: Partial<TemplateFormValues> = {
    name: initialData?.name || '',
    description: initialData?.description || '',
    prompt: initialData?.prompt || '',
    editingModelId: initialData?.editingModelId || (models[0]?.id ?? 'flux-schnell'),
    isActive: initialData?.isActive ?? true,
    variables: initialData?.variables || [],
    minImageCount: initialData?.minImageCount ?? 1,
    maxImageCount: initialData?.maxImageCount ?? 4,
    inputImageCount: initialData?.inputImageCount ?? 1,
    editingModelFieldValues: initialData?.editingModelFieldValues || {},
    ...initialData,
  };

  const handleSubmit = async (values: TemplateFormValues) => {
    setFieldErrors({});

    const variables = values.variables || [];
    const prompt = values.prompt || '';

    const { missing, invalidDropdowns } = validateTemplateVariablesInPrompt(variables, prompt);

    if (missing.length > 0) {
      toast.error(`Undefined variables in prompt: ${missing.join(', ')}`);
      return;
    }
    if (invalidDropdowns.length > 0) {
      toast.error(`Invalid dropdown configuration for: ${invalidDropdowns.join(', ')}`);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        name: values.name,
        description: values.description || undefined,
        prompt: values.prompt,
        editingModelId: values.editingModelId,
        isActive: values.isActive,
        minImageCount: values.minImageCount,
        maxImageCount: values.maxImageCount,
        inputImageCount: values.inputImageCount,
        variables: values.variables ?? [],
        editingModelFieldValues: values.editingModelFieldValues ?? {},
      };

      // Only send a new preview image when the user picked a file; an unchanged
      // string value means "keep the existing image" (handled server-side).
      if (values.previewImage instanceof File) {
        payload.previewImageBase64 = await fileToBase64(values.previewImage);
        payload.previewImageName = values.previewImage.name;
        payload.previewImageMimeType = values.previewImage.type;
      }

      const result: any =
        mode === 'edit' && initialData?.id
          ? await updateAdminTemplate({ data: { ...payload, id: initialData.id } })
          : await createAdminTemplate({ data: payload });

      if (result?.serverError) {
        toast.error(result.serverError);
        return;
      }

      if (result?.validationErrors) {
        const normalizedErrors = normalizeValidationErrors(result.validationErrors);
        setFieldErrors(normalizedErrors);
        toast.error('Validation failed. Please review the highlighted details.');
        return;
      }

      toast.success(mode === 'create' ? 'Template created successfully' : 'Template updated successfully');
      await queryClient.invalidateQueries({ queryKey: queryKeys.adminTemplates.all });
      navigate({ to: '/admin/templates' });
    } catch (error) {
      console.error('Error submitting form:', error);
      toast.error('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formConfig: FormConfig<TemplateFormValues> = {
    defaultValues,
    onSubmit: handleSubmit,
  };

  return (
    <Form
      config={formConfig}
      className="space-y-8"
    >
      {Object.keys(fieldErrors).length > 0 && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Validation Errors</CardTitle>
            <CardDescription>Please fix the following fields before saving.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(fieldErrors).map(([field, messages]) => (
                <div
                  key={field}
                  className="text-sm"
                >
                  <span className="font-semibold">{field}:</span> {messages.join(', ')}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Validation Summary Card */}
      <ValidationSummary />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Main Info */}
        <div className="lg:col-span-2 space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>General details about the template.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                name="name"
                renderFieldAction={({ value, onChange, onBlur }) => (
                  <FormItem>
                    <FormLabel>Template Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Cinematic Portrait"
                        value={value ?? ''}
                        onChange={(e) => onChange(e.target.value)}
                        onBlur={onBlur}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                name="description"
                renderFieldAction={({ value, onChange, onBlur }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe what this template generates..."
                        className="resize-none"
                        value={value ?? ''}
                        onChange={(e) => onChange(e.target.value)}
                        onBlur={onBlur}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 gap-4">
                <FormField
                  name="editingModelId"
                  renderFieldAction={({ value, onChange }) => {
                    const selectedModel = models.find((m) => m.id === value);
                    return (
                      <FormItem>
                        <FormLabel>Base Model</FormLabel>
                        <Select
                          onValueChange={onChange}
                          defaultValue={value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a model">{selectedModel?.label}</SelectValue>
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {models.map((model) => (
                              <SelectItem
                                key={model.id}
                                value={model.id}
                              >
                                {model.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Prompt Configuration</CardTitle>
              <CardDescription>Define the prompt structure and variables.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <PromptField />

              <div className="border-t pt-6">
                <VariablesField
                  mode={mode}
                  globalVariables={globalVariables}
                />
              </div>
            </CardContent>
          </Card>

          <PromptPreviewSection />
        </div>

        {/* Right Column: Settings & Preview */}
        <div className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Preview Image</CardTitle>
              <CardDescription>Template preview shown to users when browsing</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <FormField
                name="previewImage"
                renderFieldAction={({ value, onChange }) => (
                  <FormItem>
                    <FormControl>
                      <ImageUpload
                        value={value}
                        onChange={onChange}
                        previewUrl={typeof value === 'string' ? value : undefined}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
                <p className="font-medium">Recommended:</p>
                <ul className="list-disc list-inside space-y-0.5 ml-1">
                  <li>Dimensions: 512x512px or higher</li>
                  <li>Aspect ratio: Square (1:1)</li>
                  <li>Format: JPG, PNG, or WebP</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Generation Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted/50 p-3 rounded-md text-sm space-y-2">
                <p className="font-semibold text-foreground">Available Variables</p>
                <p className="text-muted-foreground">Use these variables in text fields below to inject dynamic values:</p>
                <div className="space-y-1 pt-1">
                  <div className="flex items-start gap-2">
                    <code className="text-xs bg-background px-1.5 py-0.5 rounded border font-mono whitespace-nowrap">
                      {'{template_prompt}'}
                    </code>
                    <span className="text-xs text-muted-foreground">The final generated prompt with all variables filled</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground pt-2 border-t">Click any variable code to copy it</p>
              </div>

              <ModelFieldsSection models={models} />

              <div className="space-y-4 pt-4 border-t">
                <FormField
                  name="inputImageCount"
                  renderFieldAction={({ value, onChange }) => (
                    <FormItem>
                      <FormLabel>Input Images</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={4}
                          value={value ?? ''}
                          onChange={(e) => onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormDescription>Number of images user must upload (1-4)</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    name="minImageCount"
                    renderFieldAction={({ value, onChange }) => (
                      <FormItem>
                        <FormLabel>Min Images</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            max={4}
                            value={value ?? ''}
                            onChange={(e) => onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    name="maxImageCount"
                    renderFieldAction={({ value, onChange }) => (
                      <FormItem>
                        <FormLabel>Max Images</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            max={4}
                            value={value ?? ''}
                            onChange={(e) => onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Visibility</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                name="isActive"
                renderFieldAction={({ value, onChange }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Active</FormLabel>
                      <FormDescription>Visible to users</FormDescription>
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
            </CardContent>
          </Card>

          <Button
            type="submit"
            className="w-full"
            disabled={isSubmitting}
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === 'create' ? 'Create Template' : 'Save Changes'}
          </Button>
        </div>
      </div>

      <TemplateTestGeneration models={models} />
    </Form>
  );
}
