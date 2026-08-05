import { useForm } from '@tanstack/react-form';
import * as React from 'react';
import type { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/libs/utils';

// Core types for TanStack Form integration
export type FormValues = Record<string, any>;

// Enhanced form configuration with better typing
export type FormConfig<TFormData = FormValues> = {
  defaultValues?: Partial<TFormData>;
  onSubmit: (values: TFormData) => Promise<void> | void;
  validators?: {
    onChange?: (opts: { value: Partial<TFormData> }) => string | undefined;
    onBlur?: (opts: { value: Partial<TFormData> }) => string | undefined;
    onSubmit?: (opts: { value: Partial<TFormData> }) => string | undefined;
    onChangeAsync?: (opts: { value: Partial<TFormData> }) => Promise<string | undefined>;
    onBlurAsync?: (opts: { value: Partial<TFormData> }) => Promise<string | undefined>;
    onSubmitAsync?: (opts: { value: Partial<TFormData> }) => Promise<string | undefined>;
  };
  asyncInitialValues?: () => Promise<Partial<TFormData>>;
};

// Legacy support for Zod schemas
export type FormConfigWithSchema<TSchema extends z.ZodType> = {
  schema: TSchema;
  onSubmit: (values: z.infer<TSchema>) => Promise<void> | void;
  defaultValues?: Partial<z.infer<TSchema>>;
  mode?: 'onChange' | 'onBlur' | 'onSubmit';
  asyncInitialValues?: () => Promise<Partial<z.infer<TSchema>>>;
};

// Context for form state with simplified typing
type FormContextValue = {
  form: any; // Simplified to avoid generic complexity
};

const FormContext = React.createContext<FormContextValue | null>(null);

// Context for field state with simplified typing
type FormFieldContextValue = {
  fieldApi: any; // Simplified to avoid generic complexity
  name: string;
};

const FormFieldContext = React.createContext<FormFieldContextValue | null>(null);

// Context for form item (accessibility)
type FormItemContextValue = {
  id: string;
};

const FormItemContext = React.createContext<FormItemContextValue | null>(null);

// Enhanced Form Provider with simplified typing
export function Form<TFormData = FormValues>({
  config,
  children,
  className,
  ...props
}: {
  config: FormConfig<TFormData>;
  children: React.ReactNode | ((formApi: any) => React.ReactNode);
  className?: string;
} & Omit<React.FormHTMLAttributes<HTMLFormElement>, 'children'>) {
  const { defaultValues, asyncInitialValues, validators, onSubmit } = config;
  const [initialValues, setInitialValues] = React.useState(defaultValues || {});
  const [isLoadingInitial, setIsLoadingInitial] = React.useState(!!asyncInitialValues);

  React.useEffect(() => {
    if (asyncInitialValues) {
      asyncInitialValues().then((values) => {
        setInitialValues({ ...defaultValues, ...values });
        setIsLoadingInitial(false);
      });
    }
  }, [asyncInitialValues, defaultValues]);

  const form = useForm({
    defaultValues: initialValues as any,
    validators: validators as any,
    onSubmit: async ({ value }) => {
      await onSubmit(value as TFormData);
    },
  });

  // Update form values when async initial values load
  React.useEffect(() => {
    if (!isLoadingInitial && asyncInitialValues) {
      Object.entries(initialValues).forEach(([key, value]) => {
        if (value !== undefined) {
          form.setFieldValue(key, value as any);
        }
      });
    }
  }, [initialValues, isLoadingInitial, form, asyncInitialValues]);

  if (isLoadingInitial) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="text-sm text-muted-foreground">Loading form...</div>
      </div>
    );
  }

  return (
    <FormContext.Provider value={{ form }}>
      <form
        className={cn('space-y-6', className)}
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
        {...props}
      >
        {typeof children === 'function' ? children(form) : children}
      </form>
    </FormContext.Provider>
  );
}

// Legacy Form component with Zod schema support
export function FormWithSchema<TSchema extends z.ZodType>({
  config,
  children,
  className,
  ...props
}: {
  config: FormConfigWithSchema<TSchema>;
  children: React.ReactNode | ((formApi: any) => React.ReactNode);
  className?: string;
} & Omit<React.FormHTMLAttributes<HTMLFormElement>, 'children'>) {
  const { defaultValues, asyncInitialValues, schema, onSubmit } = config;
  const [initialValues, setInitialValues] = React.useState(defaultValues || {});
  const [isLoadingInitial, setIsLoadingInitial] = React.useState(!!asyncInitialValues);

  React.useEffect(() => {
    if (asyncInitialValues) {
      asyncInitialValues().then((values) => {
        setInitialValues({ ...defaultValues, ...values });
        setIsLoadingInitial(false);
      });
    }
  }, [asyncInitialValues, defaultValues]);

  const form = useForm({
    defaultValues: initialValues as any,
    validators: {
      onChange: schema as any,
    },
    onSubmit: async ({ value }) => {
      await onSubmit(value);
    },
  });

  // Update form values when async initial values load
  React.useEffect(() => {
    if (!isLoadingInitial && asyncInitialValues) {
      Object.entries(initialValues).forEach(([key, value]) => {
        if (value !== undefined) {
          form.setFieldValue(key, value as any);
        }
      });
    }
  }, [initialValues, isLoadingInitial, form, asyncInitialValues]);

  if (isLoadingInitial) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="text-sm text-muted-foreground">Loading form...</div>
      </div>
    );
  }

  return (
    <FormContext.Provider value={{ form }}>
      <form
        className={cn('space-y-6', className)}
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
        {...props}
      >
        {typeof children === 'function' ? children(form) : children}
      </form>
    </FormContext.Provider>
  );
}

// Hook to get form context
export function useFormContext(): FormContextValue {
  const context = React.useContext(FormContext);
  if (!context) {
    throw new Error('useFormContext must be used within a Form');
  }
  return context;
}

// Enhanced Field Component with simplified typing
export function FormField({
  name,
  renderFieldAction,
  validators,
  asyncDebounceMs,
}: {
  name: string;
  renderFieldAction: (field: {
    value: any;
    error?: string;
    onChange: (value: any) => void;
    onBlur: () => void;
    isValidating: boolean;
    isTouched: boolean;
    isDirty: boolean;
    isValid: boolean;
  }) => React.ReactNode;
  validators?: {
    onChange?: (opts: { value: any }) => string | undefined;
    onChangeAsync?: (opts: { value: any }) => Promise<string | undefined>;
    onBlur?: (opts: { value: any }) => string | undefined;
    onBlurAsync?: (opts: { value: any }) => Promise<string | undefined>;
    onSubmit?: (opts: { value: any }) => string | undefined;
    onSubmitAsync?: (opts: { value: any }) => Promise<string | undefined>;
    onChangeAsyncDebounceMs?: number;
    onBlurAsyncDebounceMs?: number;
    onChangeListenTo?: string[];
  };
  asyncDebounceMs?: number;
}) {
  const { form } = useFormContext();

  return (
    <form.Field
      name={name}
      validators={validators as any}
      asyncDebounceMs={asyncDebounceMs}
    >
      {(field: any) => {
        // Enhanced error extraction with better handling
        const errors = field.state.meta.errors;
        let error: string | undefined;

        if (errors && errors.length > 0) {
          error = extractErrorMessage(errors[0]);
          // Don't show generic fallback errors at field level
          if (error === 'Validation error') {
            error = undefined;
          }
        }

        return (
          <FormFieldContext.Provider value={{ fieldApi: field, name }}>
            {renderFieldAction({
              value: field.state.value,
              error,
              onChange: field.handleChange,
              onBlur: field.handleBlur,
              isValidating: field.state.meta.isValidating,
              isTouched: field.state.meta.isTouched,
              isDirty: field.state.meta.isDirty,
              isValid: field.state.meta.isValid,
            })}
          </FormFieldContext.Provider>
        );
      }}
    </form.Field>
  );
}

// Hook to get field context
export function useFormField() {
  const fieldContext = React.useContext(FormFieldContext);
  const itemContext = React.useContext(FormItemContext);

  if (!fieldContext) {
    throw new Error('useFormField must be used within a FormField');
  }

  if (!itemContext) {
    throw new Error('useFormField must be used within a FormItem');
  }

  const { fieldApi, name } = fieldContext;
  const { id } = itemContext;

  // Get field state with proper error extraction
  const fieldState = fieldApi.state;
  const errors = fieldState.meta.errors;
  let error: string | undefined;

  if (errors && errors.length > 0) {
    error = extractErrorMessage(errors[0]);
    // Don't show generic fallback errors at field level
    if (error === 'Validation error') {
      error = undefined;
    }
  }

  return {
    id,
    name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    error,
    fieldState,
    fieldApi,
    isValidating: fieldState.meta.isValidating,
    isTouched: fieldState.meta.isTouched,
    isDirty: fieldState.meta.isDirty,
    isValid: fieldState.meta.isValid,
  };
}

// Form Item Component
export function FormItem({ className, ...props }: React.ComponentProps<'div'>) {
  const id = React.useId();

  return (
    <FormItemContext.Provider value={{ id }}>
      <div
        data-slot="form-item"
        className={cn('grid gap-2', className)}
        {...props}
      />
    </FormItemContext.Provider>
  );
}

// Enhanced Form Label Component with better accessibility
export function FormLabel({ className, ...props }: React.ComponentProps<'label'>) {
  const { error, formItemId, isValidating } = useFormField();

  return (
    <Label
      data-slot="form-label"
      data-error={!!error}
      data-validating={isValidating}
      className={cn('data-[error=true]:text-destructive', 'data-[validating=true]:opacity-75', className)}
      htmlFor={formItemId}
      {...props}
    />
  );
}

// Enhanced Form Control Component with better accessibility
// Uses React.cloneElement to pass props to child element (similar to Radix Slot)
export function FormControl({ children }: { children: React.ReactElement<any> }) {
  const { error, formItemId, formDescriptionId, formMessageId, isValidating } = useFormField();

  const childProps = {
    'data-slot': 'form-control',
    id: formItemId,
    'aria-describedby': !error ? formDescriptionId : `${formDescriptionId} ${formMessageId}`,
    'aria-invalid': !!error || undefined,
    'aria-busy': isValidating || undefined,
  };

  return React.cloneElement(children, childProps);
}

// Form Description Component
export function FormDescription({ className, ...props }: React.ComponentProps<'p'>) {
  const { formDescriptionId } = useFormField();

  return (
    <p
      data-slot="form-description"
      id={formDescriptionId}
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}

// Enhanced Form Message Component with animation support
export function FormMessage({ className, ...props }: React.ComponentProps<'p'>) {
  const { error, formMessageId } = useFormField();
  const body = error ? String(error) : props.children;

  if (!body) {
    return null;
  }

  return (
    <p
      data-slot="form-message"
      id={formMessageId}
      role="alert"
      aria-live="polite"
      className={cn('text-destructive text-sm font-medium', 'animate-in slide-in-from-top-1 duration-200', className)}
      {...props}
    >
      {body}
    </p>
  );
}

// Enhanced Submit Button Component with better UX
export function FormSubmit({
  children,
  className,
  disabled,
  loadingText = 'Submitting...',
  ...props
}: React.ComponentProps<'button'> & {
  loadingText?: string;
}) {
  const { form } = useFormContext();
  const canSubmit = form.state.canSubmit;
  const isSubmitting = form.state.isSubmitting;
  const isValid = form.state.isValid;

  return (
    <Button
      type="submit"
      disabled={disabled || !canSubmit || isSubmitting || !isValid}
      className={className}
      {...props}
    >
      {isSubmitting ? loadingText : children}
    </Button>
  );
}

// Enhanced base field props
type BaseFieldProps = {
  name: string;
  label: string;
  description?: string;
  optional?: boolean;
  disabled?: boolean;
  hidden?: boolean;
  className?: string;
  validators?: {
    onChange?: (opts: { value: any }) => string | undefined;
    onChangeAsync?: (opts: { value: any }) => Promise<string | undefined>;
    onBlur?: (opts: { value: any }) => string | undefined;
    onBlurAsync?: (opts: { value: any }) => Promise<string | undefined>;
    onSubmit?: (opts: { value: any }) => string | undefined;
    onSubmitAsync?: (opts: { value: any }) => Promise<string | undefined>;
    onChangeAsyncDebounceMs?: number;
    onBlurAsyncDebounceMs?: number;
    onChangeListenTo?: string[];
  };
  asyncDebounceMs?: number;
};

// Enhanced Linked Fields Hook
export function useLinkedField(
  fieldName: string,
  dependencies: string[],
  transform: (values: Record<string, any>) => any,
  options: {
    debounceMs?: number;
    immediate?: boolean;
  } = {},
) {
  const { form } = useFormContext();
  const { debounceMs = 0, immediate = true } = options;

  React.useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const updateLinkedField = () => {
      const currentValues = form.state.values;
      const dependencyValues = dependencies.reduce(
        (acc, dep) => {
          acc[dep] = currentValues[dep];
          return acc;
        },
        {} as Record<string, any>,
      );

      const newValue = transform(dependencyValues);
      const currentValue = form.getFieldValue(fieldName);

      if (newValue !== currentValue) {
        form.setFieldValue(fieldName, newValue);
      }
    };

    const debouncedUpdate = () => {
      if (debounceMs > 0) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(updateLinkedField, debounceMs);
      } else {
        updateLinkedField();
      }
    };

    // Initial update if immediate is true
    if (immediate) {
      updateLinkedField();
    }

    const { unsubscribe } = form.store.subscribe(debouncedUpdate);

    return () => {
      clearTimeout(timeoutId);
      unsubscribe();
    };
  }, [form, fieldName, dependencies, transform, debounceMs, immediate]);

  return form.getFieldValue(fieldName);
}

// Enhanced Form Errors component with better styling
export function FormErrors({
  className,
  showOnSubmit = true,
  showAlways = false,
}: {
  className?: string;
  showOnSubmit?: boolean;
  showAlways?: boolean;
}) {
  const { form } = useFormContext();
  const [showErrors, setShowErrors] = React.useState(showAlways);

  React.useEffect(() => {
    if (showAlways) {
      setShowErrors(true);
      return;
    }

    const { unsubscribe } = form.store.subscribe(() => {
      if (showOnSubmit) {
        // Show errors if form was submitted but invalid
        if (form.state.isSubmitted && !form.state.isValid) {
          setShowErrors(true);
        } else if (form.state.isValid) {
          setShowErrors(false);
        }
      }
    });

    return unsubscribe;
  }, [form, showOnSubmit, showAlways]);

  if (!showErrors || form.state.isValid) {
    return null;
  }

  // Extract readable error messages
  const errorMessages = form.state.errors
    .map((error: any) => extractErrorMessage(error))
    .filter((msg: string) => msg && msg !== 'Validation error'); // Filter out generic messages

  // If no readable errors, don't show the component
  if (errorMessages.length === 0) {
    return null;
  }

  return (
    <div className={cn('rounded-lg border border-destructive/50 p-4 bg-destructive/10', className)}>
      <div className="text-destructive text-sm font-medium mb-2">Please fix the following errors:</div>
      <ul className="text-destructive text-sm space-y-1">
        {errorMessages.map((error: string) => (
          <li
            key={error}
            className="flex items-start gap-2"
          >
            <span className="text-destructive mt-0.5">•</span>
            <span>{error}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Enhanced error message extraction with better support for different error types
function extractErrorMessage(error: any): string {
  if (!error) return 'Validation error';

  // If it's already a string, return it
  if (typeof error === 'string') return error;

  // Handle arrays of errors (return first one)
  if (Array.isArray(error) && error.length > 0) {
    return extractErrorMessage(error[0]);
  }

  // Handle error objects
  if (error && typeof error === 'object') {
    // Check for message property first
    if ('message' in error && typeof error.message === 'string') {
      return error.message;
    }

    // Handle Zod error with issues array
    if ('issues' in error && Array.isArray(error.issues) && error.issues.length > 0) {
      const issue = error.issues[0];
      if (issue && typeof issue === 'object' && 'message' in issue) {
        return String(issue.message);
      }
    }

    // Handle TanStack Form validation errors
    if ('type' in error && 'message' in error) {
      return String(error.message);
    }

    // Handle nested error structures
    if ('error' in error) {
      return extractErrorMessage(error.error);
    }

    // Handle validation error with code and message
    if ('code' in error && 'message' in error) {
      return String(error.message);
    }

    // Last resort: try toString if it exists and isn't default object toString
    if (typeof error.toString === 'function') {
      const stringified = error.toString();
      if (stringified !== '[object Object]' && stringified !== '[object Object object Object]') {
        return stringified;
      }
    }
  }

  return 'Validation error';
}

// Enhanced Input Field Component
export function InputField({
  name,
  label,
  placeholder,
  type = 'text',
  description,
  optional = false,
  disabled = false,
  hidden = false,
  className,
  validators,
  asyncDebounceMs,
  ...props
}: BaseFieldProps & {
  placeholder?: string;
  type?: string;
} & Omit<React.ComponentProps<'input'>, 'name' | 'type'>) {
  if (hidden) return null;

  return (
    <FormField
      name={name}
      validators={validators}
      asyncDebounceMs={asyncDebounceMs}
      renderFieldAction={({ value, error, onChange, onBlur, isValidating }) => (
        <FormItem className={className}>
          <FormLabel>
            {label}
            {optional && <span className="text-muted-foreground ml-1">(optional)</span>}
            {isValidating && <span className="text-muted-foreground ml-1 text-xs">(validating...)</span>}
          </FormLabel>
          <FormControl>
            <Input
              type={type}
              placeholder={placeholder}
              value={value ?? ''}
              onChange={(e) => onChange(e.target.value)}
              onBlur={onBlur}
              disabled={disabled}
              className={cn(error && 'border-destructive')}
              {...props}
            />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

// Enhanced Number Field Component
export function NumberField({
  name,
  label,
  placeholder,
  description,
  optional = false,
  disabled = false,
  hidden = false,
  min,
  max,
  step,
  className,
  validators,
  asyncDebounceMs,
  ...props
}: BaseFieldProps & {
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
} & Omit<React.ComponentProps<'input'>, 'name' | 'type'>) {
  if (hidden) return null;

  return (
    <FormField
      name={name}
      validators={validators}
      asyncDebounceMs={asyncDebounceMs}
      renderFieldAction={({ value, error, onChange, onBlur, isValidating }) => (
        <FormItem className={className}>
          <FormLabel>
            {label}
            {optional && <span className="text-muted-foreground ml-1">(optional)</span>}
            {isValidating && <span className="text-muted-foreground ml-1 text-xs">(validating...)</span>}
          </FormLabel>
          <FormControl>
            <Input
              type="number"
              placeholder={placeholder}
              value={value ?? ''}
              onChange={(e) => {
                const val = e.target.value;
                onChange(val === '' ? undefined : Number(val));
              }}
              onBlur={onBlur}
              disabled={disabled}
              min={min}
              max={max}
              step={step}
              className={cn(error && 'border-destructive')}
              {...props}
            />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

// Enhanced Textarea Field Component
export function TextareaField({
  name,
  label,
  placeholder,
  description,
  optional = false,
  disabled = false,
  hidden = false,
  rows = 3,
  className,
  validators,
  asyncDebounceMs,
  ...props
}: BaseFieldProps & {
  placeholder?: string;
  rows?: number;
} & Omit<React.ComponentProps<'textarea'>, 'name'>) {
  if (hidden) return null;

  return (
    <FormField
      name={name}
      validators={validators}
      asyncDebounceMs={asyncDebounceMs}
      renderFieldAction={({ value, error, onChange, onBlur, isValidating }) => (
        <FormItem className={className}>
          <FormLabel>
            {label}
            {optional && <span className="text-muted-foreground ml-1">(optional)</span>}
            {isValidating && <span className="text-muted-foreground ml-1 text-xs">(validating...)</span>}
          </FormLabel>
          <FormControl>
            <Textarea
              placeholder={placeholder}
              value={value ?? ''}
              onChange={(e) => onChange(e.target.value)}
              onBlur={onBlur}
              disabled={disabled}
              rows={rows}
              className={cn(error && 'border-destructive')}
              {...props}
            />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

// Enhanced Select Field Component
export function SelectField({
  name,
  label,
  placeholder,
  options,
  description,
  optional = false,
  disabled = false,
  hidden = false,
  className,
  validators,
  asyncDebounceMs,
}: BaseFieldProps & {
  placeholder?: string;
  options: { value: string; label: string; disabled?: boolean }[];
}) {
  if (hidden) return null;

  return (
    <FormField
      name={name}
      validators={validators}
      asyncDebounceMs={asyncDebounceMs}
      renderFieldAction={({ value, error, onChange, isValidating }) => (
        <FormItem className={className}>
          <FormLabel>
            {label}
            {optional && <span className="text-muted-foreground ml-1">(optional)</span>}
            {isValidating && <span className="text-muted-foreground ml-1 text-xs">(validating...)</span>}
          </FormLabel>
          <Select
            value={value ?? ''}
            onValueChange={onChange}
            disabled={disabled}
          >
            <FormControl>
              <SelectTrigger className={cn(error && 'border-destructive')}>
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {options.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

// Enhanced Checkbox Field Component
export function CheckboxField({
  name,
  label,
  description,
  disabled = false,
  hidden = false,
  className,
  validators,
  asyncDebounceMs,
}: Omit<BaseFieldProps, 'optional'>) {
  if (hidden) return null;

  return (
    <FormField
      name={name}
      validators={validators}
      asyncDebounceMs={asyncDebounceMs}
      renderFieldAction={({ value, onChange, isValidating }) => (
        <FormItem className={cn('flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4', className)}>
          <FormControl>
            <Checkbox
              checked={Boolean(value)}
              onCheckedChange={onChange}
              disabled={disabled}
            />
          </FormControl>
          <div className="space-y-1 leading-none">
            <FormLabel className={cn('cursor-pointer', disabled && 'cursor-not-allowed opacity-50')}>
              {label}
              {isValidating && <span className="text-muted-foreground ml-1 text-xs">(validating...)</span>}
            </FormLabel>
            {description && <FormDescription>{description}</FormDescription>}
            <FormMessage />
          </div>
        </FormItem>
      )}
    />
  );
}

// Enhanced Switch Field Component
export function SwitchField({
  name,
  label,
  description,
  disabled = false,
  hidden = false,
  className,
  validators,
  asyncDebounceMs,
}: Omit<BaseFieldProps, 'optional'>) {
  if (hidden) return null;

  return (
    <FormField
      name={name}
      validators={validators}
      asyncDebounceMs={asyncDebounceMs}
      renderFieldAction={({ value, onChange, isValidating }) => (
        <FormItem className={cn('flex flex-row items-center justify-between rounded-lg border p-4', className)}>
          <div className="space-y-0.5">
            <FormLabel className={cn('text-base', disabled && 'opacity-50')}>
              {label}
              {isValidating && <span className="text-muted-foreground ml-1 text-xs">(validating...)</span>}
            </FormLabel>
            {description && <FormDescription>{description}</FormDescription>}
          </div>
          <FormControl>
            <Switch
              checked={Boolean(value)}
              onCheckedChange={onChange}
              disabled={disabled}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

// Enhanced Date Field Component
export function DateField({
  name,
  label,
  description,
  optional = false,
  disabled = false,
  hidden = false,
  min,
  max,
  className,
  validators,
  asyncDebounceMs,
}: BaseFieldProps & {
  min?: string;
  max?: string;
}) {
  if (hidden) return null;

  return (
    <FormField
      name={name}
      validators={validators}
      asyncDebounceMs={asyncDebounceMs}
      renderFieldAction={({ value, error, onChange, onBlur, isValidating }) => (
        <FormItem className={className}>
          <FormLabel>
            {label}
            {optional && <span className="text-muted-foreground ml-1">(optional)</span>}
            {isValidating && <span className="text-muted-foreground ml-1 text-xs">(validating...)</span>}
          </FormLabel>
          <FormControl>
            <Input
              type="date"
              value={value ?? ''}
              onChange={(e) => onChange(e.target.value)}
              onBlur={onBlur}
              disabled={disabled}
              min={min}
              max={max}
              className={cn(error && 'border-destructive')}
            />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

// Enhanced DateTime Field Component
export function DateTimeField({
  name,
  label,
  description,
  optional = false,
  disabled = false,
  hidden = false,
  min,
  max,
  className,
  validators,
  asyncDebounceMs,
}: BaseFieldProps & {
  min?: string;
  max?: string;
}) {
  if (hidden) return null;

  return (
    <FormField
      name={name}
      validators={validators}
      asyncDebounceMs={asyncDebounceMs}
      renderFieldAction={({ value, error, onChange, onBlur, isValidating }) => (
        <FormItem className={className}>
          <FormLabel>
            {label}
            {optional && <span className="text-muted-foreground ml-1">(optional)</span>}
            {isValidating && <span className="text-muted-foreground ml-1 text-xs">(validating...)</span>}
          </FormLabel>
          <FormControl>
            <Input
              type="datetime-local"
              value={value ?? ''}
              onChange={(e) => onChange(e.target.value)}
              onBlur={onBlur}
              disabled={disabled}
              min={min}
              max={max}
              className={cn(error && 'border-destructive')}
            />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

// Enhanced File Field Component
export function FileField({
  name,
  label,
  description,
  optional = false,
  disabled = false,
  hidden = false,
  accept,
  multiple = false,
  className,
  validators,
  asyncDebounceMs,
}: BaseFieldProps & {
  accept?: string;
  multiple?: boolean;
}) {
  if (hidden) return null;

  return (
    <FormField
      name={name}
      validators={validators}
      asyncDebounceMs={asyncDebounceMs}
      renderFieldAction={({ error, onChange, onBlur, isValidating }) => (
        <FormItem className={className}>
          <FormLabel>
            {label}
            {optional && <span className="text-muted-foreground ml-1">(optional)</span>}
            {isValidating && <span className="text-muted-foreground ml-1 text-xs">(validating...)</span>}
          </FormLabel>
          <FormControl>
            <Input
              type="file"
              onChange={(e) => onChange(multiple ? e.target.files : e.target.files?.[0])}
              onBlur={onBlur}
              disabled={disabled}
              accept={accept}
              multiple={multiple}
              className={cn(
                error && 'border-destructive',
                'file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/80',
              )}
            />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

// Enhanced Radio Group Field Component
export function RadioField({
  name,
  label,
  options,
  description,
  optional = false,
  disabled = false,
  hidden = false,
  className,
  validators,
  asyncDebounceMs,
}: BaseFieldProps & {
  options: { value: string; label: string; disabled?: boolean }[];
}) {
  if (hidden) return null;

  return (
    <FormField
      name={name}
      validators={validators}
      asyncDebounceMs={asyncDebounceMs}
      renderFieldAction={({ value, onChange, isValidating }) => (
        <FormItem className={className}>
          <FormLabel>
            {label}
            {optional && <span className="text-muted-foreground ml-1">(optional)</span>}
            {isValidating && <span className="text-muted-foreground ml-1 text-xs">(validating...)</span>}
          </FormLabel>
          <FormControl>
            <div className="space-y-2">
              {options.map((option) => (
                <div
                  key={option.value}
                  className="flex items-center space-x-2"
                >
                  <input
                    type="radio"
                    id={`${name}-${option.value}`}
                    name={name}
                    value={option.value}
                    checked={value === option.value}
                    onChange={(e) => onChange(e.target.value)}
                    disabled={disabled || option.disabled}
                    className="h-4 w-4 border-border text-primary focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  />
                  <label
                    htmlFor={`${name}-${option.value}`}
                    className={cn(
                      'text-sm font-medium leading-none cursor-pointer',
                      (disabled || option.disabled) && 'opacity-50 cursor-not-allowed',
                    )}
                  >
                    {option.label}
                  </label>
                </div>
              ))}
            </div>
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

// Form Array Support
export function FormArray({
  name,
  renderItemAction,
  validators,
  asyncDebounceMs,
}: {
  name: string;
  renderItemAction: (arrayApi: {
    fields: Array<{ key: string; index: number; value: any }>;
    append: (value: any) => void;
    prepend: (value: any) => void;
    remove: (index: number) => void;
    swap: (indexA: number, indexB: number) => void;
    move: (from: number, to: number) => void;
  }) => React.ReactNode;
  validators?: BaseFieldProps['validators'];
  asyncDebounceMs?: number;
}) {
  const { form } = useFormContext();

  return (
    <FormField
      name={name}
      validators={validators}
      asyncDebounceMs={asyncDebounceMs}
      renderFieldAction={({ value }) => {
        const arrayValue = Array.isArray(value) ? value : [];

        const fields = arrayValue.map((item, index) => ({
          key: `${name}-${index}`,
          index,
          value: item,
        }));

        const append = (newValue: any) => {
          const current = form.getFieldValue(name) || [];
          form.setFieldValue(name, [...current, newValue]);
        };

        const prepend = (newValue: any) => {
          const current = form.getFieldValue(name) || [];
          form.setFieldValue(name, [newValue, ...current]);
        };

        const remove = (index: number) => {
          const current = form.getFieldValue(name) || [];
          form.setFieldValue(
            name,
            current.filter((_: any, i: number) => i !== index),
          );
        };

        const swap = (indexA: number, indexB: number) => {
          const current = [...(form.getFieldValue(name) || [])];
          [current[indexA], current[indexB]] = [current[indexB], current[indexA]];
          form.setFieldValue(name, current);
        };

        const move = (from: number, to: number) => {
          const current = [...(form.getFieldValue(name) || [])];
          const [removed] = current.splice(from, 1);
          current.splice(to, 0, removed);
          form.setFieldValue(name, current);
        };

        return renderItemAction({
          fields,
          append,
          prepend,
          remove,
          swap,
          move,
        });
      }}
    />
  );
}

// Form Reset Component
export function FormReset({ children, className, ...props }: React.ComponentProps<'button'>) {
  const { form } = useFormContext();

  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => form.reset()}
      className={className}
      {...props}
    >
      {children || 'Reset'}
    </Button>
  );
}

// Form Watch Hook - for watching specific field values
export function useFormWatch(name: string) {
  const { form } = useFormContext();
  const [value, setValue] = React.useState(form.getFieldValue(name));

  React.useEffect(() => {
    const { unsubscribe } = form.store.subscribe(() => {
      setValue(form.getFieldValue(name));
    });

    return unsubscribe;
  }, [form, name]);

  return value;
}

// Form Subscribe Component for selective re-renders
export function FormSubscribe<TSelected = any>({
  selectorAction,
  renderAction,
}: {
  selectorAction: (state: any) => TSelected;
  renderAction: (selected: TSelected) => React.ReactNode;
}) {
  const { form } = useFormContext();
  const [selected, setSelected] = React.useState(() => selectorAction(form.state));

  React.useEffect(() => {
    const { unsubscribe } = form.store.subscribe(() => {
      setSelected(selectorAction(form.state));
    });

    return unsubscribe;
  }, [form, selectorAction]);

  return <>{renderAction(selected)}</>;
}
