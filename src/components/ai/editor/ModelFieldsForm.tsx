import type { z } from 'zod';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import type { editingModelField } from '@/db/schema/ai';
import type { editingModelFieldSchema } from '@/schemas/admin/editing-model-schema';
import { ExpandableTextarea } from './ExpandableTextarea';
import styles from './ModelFieldsForm.module.css';

type EditingModelField = typeof editingModelField.$inferSelect;

export type { EditingModelField };

// Prisma stores `type` as a free string column; the rendered branches only use these values.
type FieldType = z.infer<typeof editingModelFieldSchema>['type'];

interface ModelFieldsFormProps {
  fields: EditingModelField[];
  values: Record<string, any>;
  onChange: (values: Record<string, any>) => void;
  onSubmitShortcut?: (name: string, value: unknown) => void;
}

export function ModelFieldsForm({ fields, values, onChange, onSubmitShortcut }: ModelFieldsFormProps) {
  // Filter out readonly fields
  const visibleFields = fields.filter((field) => !field.isReadonly);

  const updateValue = (name: string, value: any) => {
    onChange({ ...values, [name]: value });
  };

  const getValue = (field: EditingModelField) => {
    return values[field.name] ?? field.defaultValue ?? '';
  };

  const renderField = (field: EditingModelField) => {
    const value = getValue(field);
    const fieldType = field.type as FieldType;

    // Handle enum type (comma-separated options)
    if (fieldType === 'enum' && field.enumOptions) {
      const options = field.enumOptions
        .split(',')
        .map((opt) => opt.trim())
        .filter(Boolean);
      const currentValue = String(value);

      return (
        <div
          key={field.id}
          className="stack space-2"
        >
          <Label className={styles.label}>{field.label}</Label>
          {field.description && <p className={styles.description}>{field.description}</p>}
          <Select
            value={currentValue}
            onValueChange={(val) => val && updateValue(field.name, val)}
          >
            <SelectTrigger>
              <SelectValue placeholder={`Select ${field.label}`}>{currentValue || `Select ${field.label}`}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem
                  key={option}
                  value={option}
                >
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }

    // Handle number type with slider
    if (fieldType === 'number' && field.isSlider) {
      const numValue = value ? Number(value) : Number(field.defaultValue) || 0;
      const min = field.minValue ? Number(field.minValue) : 0;
      const max = field.maxValue ? Number(field.maxValue) : 100;
      const step = field.step ? Number(field.step) : 1;

      return (
        <div
          key={field.id}
          className="stack space-2"
        >
          <div className={styles.sliderHeader}>
            <Label className={styles.label}>{field.label}</Label>
            <span className={styles.sliderValue}>{numValue}</span>
          </div>
          {field.description && <p className={styles.description}>{field.description}</p>}
          <Slider
            value={[numValue]}
            onValueChange={(val) => updateValue(field.name, Array.isArray(val) ? val[0] : val)}
            min={min}
            max={max}
            step={step}
          />
        </div>
      );
    }

    // Handle regular number type
    if (fieldType === 'number') {
      return (
        <div
          key={field.id}
          className="stack space-2"
        >
          <Label className={styles.label}>{field.label}</Label>
          {field.description && <p className={styles.description}>{field.description}</p>}
          <Input
            type="number"
            min={field.minValue ? Number(field.minValue) : undefined}
            max={field.maxValue ? Number(field.maxValue) : undefined}
            step={field.step ? Number(field.step) : undefined}
            value={value}
            onChange={(e) => updateValue(field.name, Number(e.target.value))}
            placeholder={field.label}
          />
        </div>
      );
    }

    // Handle boolean type
    if (fieldType === 'boolean') {
      const boolValue = value === 'true' || value === true;
      return (
        <div
          key={field.id}
          className={styles.switchField}
        >
          <div className="stack space-1">
            <Label className={styles.label}>{field.label}</Label>
            {field.description && <p className={styles.description}>{field.description}</p>}
          </div>
          <Switch
            checked={boolValue}
            onCheckedChange={(checked) => updateValue(field.name, checked)}
          />
        </div>
      );
    }

    // Handle string type with textarea (expandable)
    if (fieldType === 'string' && field.isTextarea) {
      return (
        <div
          key={field.id}
          className="stack space-2"
        >
          <Label className={styles.label}>{field.label}</Label>
          <ExpandableTextarea
            label={field.label}
            value={String(value)}
            onChange={(val) => updateValue(field.name, val)}
            onSubmitShortcut={(val) => onSubmitShortcut?.(field.name, val)}
            placeholder={field.label}
            description={field.description || undefined}
            showCharCount={field.showCharCount}
          />
        </div>
      );
    }

    // Handle regular string type
    if (fieldType === 'string') {
      return (
        <div
          key={field.id}
          className="stack space-2"
        >
          <Label className={styles.label}>{field.label}</Label>
          {field.description && <p className={styles.description}>{field.description}</p>}
          <Input
            value={String(value)}
            onChange={(e) => updateValue(field.name, e.target.value)}
            placeholder={field.label}
          />
          {field.showCharCount && <p className={styles.charCount}>{String(value).length} characters</p>}
        </div>
      );
    }

    return null;
  };

  if (visibleFields.length === 0) {
    return null;
  }

  return <div className="stack space-4">{visibleFields.map(renderField)}</div>;
}
