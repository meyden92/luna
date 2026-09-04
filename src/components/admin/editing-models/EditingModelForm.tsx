import { useNavigate } from '@tanstack/react-router';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useAppMutation } from '@/hooks/use-app-mutation';
import type { EditingModelFieldInput } from '@/schemas/admin/editing-model-schema';
import { createEditingModel, type getEditingModel, updateEditingModel } from '@/server/fns/admin/models';
import styles from './EditingModelForm.module.css';

type EditingModel = Awaited<ReturnType<typeof getEditingModel>>;
// Form-local field shape: nullable DB columns are edited as plain strings (empty = unset) and
// normalized back to null on submit; `id` is a client key for React lists.
type EditingModelFormField = {
  id: string;
  name: string;
  label: string;
  type: EditingModelFieldInput['type'];
  description: string;
  isRequired: boolean;
  defaultValue: string;
  minValue: string;
  maxValue: string;
  step: string;
  enumOptions: string;
  isReadonly: boolean;
  isTextarea: boolean;
  isSlider: boolean;
  showCharCount: boolean;
  sortOrder: number;
};

interface EditingModelFormProps {
  model?: EditingModel;
  onSuccess?: () => void;
}

export default function EditingModelForm({ model, onSuccess }: EditingModelFormProps) {
  const navigate = useNavigate();

  const { mutate: createModel, isPending: isCreating } = useAppMutation(
    ({ data }: { data: Parameters<typeof createEditingModel>[0]['data'] }) => createEditingModel({ data }),
    {
      successMessage: 'Model created successfully',
      errorMessage: 'Failed to create model',
      onSuccess: () => {
        if (onSuccess) {
          onSuccess();
        } else {
          navigate({ to: '/admin/models', search: { tab: 'editing' } });
        }
      },
    },
  );

  const { mutate: updateModel, isPending: isUpdating } = useAppMutation(
    ({ data }: { data: Parameters<typeof updateEditingModel>[0]['data'] }) => updateEditingModel({ data }),
    {
      successMessage: 'Model updated successfully',
      errorMessage: 'Failed to update model',
      onSuccess: () => {
        if (onSuccess) {
          onSuccess();
        } else {
          navigate({ to: '/admin/models', search: { tab: 'editing' } });
        }
      },
    },
  );

  const [label, setLabel] = useState(model?.label || '');
  const [description, setDescription] = useState(model?.description || '');
  const [apiModelName, setApiModelName] = useState(model?.apiModelName || '');
  const [imageInputField, setImageInputField] = useState(model?.imageInputField || 'image_input');
  const [isActive, setIsActive] = useState(model?.isActive ?? true);
  const [sortOrder, setSortOrder] = useState(model?.sortOrder?.toString() || '0');
  const [fields, setFields] = useState<EditingModelFormField[]>(
    (model?.fields || []).map((field) => ({
      ...field,
      id: field.id || `field-${Date.now()}-${Math.random()}`,
      name: field.name || '',
      label: field.label || '',
      type: field.type as EditingModelFieldInput['type'],
      description: field.description || '',
      defaultValue: field.defaultValue || '',
      minValue: field.minValue || '',
      maxValue: field.maxValue || '',
      step: field.step || '',
      enumOptions: field.enumOptions || '',
      isReadonly: field.isReadonly || false,
      isSlider: field.isSlider || false,
      showCharCount: field.showCharCount || false,
    })),
  );

  const addField = () => {
    setFields([
      ...fields,
      {
        id: `field-${Date.now()}-${Math.random()}`,
        name: '',
        label: '',
        type: 'string',
        description: '',
        isRequired: false,
        defaultValue: '',
        minValue: '',
        maxValue: '',
        step: '',
        enumOptions: '',
        isReadonly: false,
        isTextarea: false,
        isSlider: false,
        showCharCount: false,
        sortOrder: fields.length,
      },
    ]);
  };

  const removeField = (index: number) => {
    setFields(fields.filter((_, i) => i !== index));
  };

  const updateField = (index: number, field: Partial<EditingModelFormField>) => {
    setFields(fields.map((existing, i) => (i === index ? { ...existing, ...field } : existing)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const payload = {
      label,
      description,
      apiModelName,
      imageInputField,
      isActive,
      sortOrder: Number.parseInt(sortOrder, 10),
      fields: fields.map((field) => ({
        name: field.name,
        label: field.label,
        type: field.type,
        description: field.description || null,
        isRequired: field.isRequired,
        defaultValue: field.defaultValue || null,
        minValue: field.minValue || null,
        maxValue: field.maxValue || null,
        step: field.step || null,
        enumOptions: field.enumOptions || null,
        isReadonly: field.isReadonly,
        isTextarea: field.isTextarea,
        isSlider: field.isSlider,
        showCharCount: field.showCharCount,
        sortOrder: field.sortOrder,
      })),
    };

    if (model) {
      updateModel({ ...payload, id: model.id });
    } else {
      createModel(payload);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="stack space-6"
    >
      <Card>
        <CardHeader>
          <CardTitle>Model Information</CardTitle>
        </CardHeader>
        <CardContent className="stack space-4">
          <div className="stack space-2">
            <Label htmlFor="label">Display Label</Label>
            <Input
              id="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Enter display label"
              required
            />
          </div>

          <div className="stack space-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter description"
            />
          </div>

          <div className="stack space-2">
            <Label htmlFor="apiModelName">API Model Name</Label>
            <Input
              id="apiModelName"
              value={apiModelName}
              onChange={(e) => setApiModelName(e.target.value)}
              placeholder="Enter API model name"
              required
            />
          </div>

          <div className="stack space-2">
            <Label htmlFor="imageInputField">Image Input Field</Label>
            <Input
              id="imageInputField"
              value={imageInputField}
              onChange={(e) => setImageInputField(e.target.value)}
              placeholder="image_input"
              required
            />
          </div>

          <div className="stack space-2">
            <Label htmlFor="sortOrder">Sort Order</Label>
            <Input
              id="sortOrder"
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </div>

          <div className={styles.toggle}>
            <Switch
              id="isActive"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
            <Label htmlFor="isActive">Active</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className={styles.rowBetween}>
            <CardTitle>Fields</CardTitle>
            <Button
              type="button"
              onClick={addField}
              size="sm"
            >
              <Plus />
              Add Field
            </Button>
          </div>
        </CardHeader>
        <CardContent className="stack space-4">
          {fields.map((field, index) => (
            <Card
              key={field.id}
              className={styles.fieldCard}
              data-alt={index % 2 === 0}
            >
              <CardContent className={`${styles.fieldBody} stack space-4`}>
                <div className={styles.fieldHead}>
                  <h4 className="weight-semibold">Field {index + 1}</h4>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => removeField(index)}
                  >
                    <Trash2 />
                  </Button>
                </div>

                <div className={styles.twoCol}>
                  <div className="stack space-2">
                    <Label>Field Name</Label>
                    <Input
                      value={field.name}
                      onChange={(e) => updateField(index, { name: e.target.value })}
                      placeholder="Enter field name"
                      required
                    />
                  </div>

                  <div className="stack space-2">
                    <Label>Display Label</Label>
                    <Input
                      value={field.label}
                      onChange={(e) => updateField(index, { label: e.target.value })}
                      placeholder="Enter display label"
                      required
                    />
                  </div>
                </div>

                <div className="stack space-2">
                  <Label>Type</Label>
                  <Select
                    value={field.type}
                    onValueChange={(value) => updateField(index, { type: value as EditingModelFieldInput['type'] })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="string">String</SelectItem>
                      <SelectItem value="number">Number</SelectItem>
                      <SelectItem value="boolean">Boolean</SelectItem>
                      <SelectItem value="enum">Enum</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="stack space-2">
                  <Label>Field Description</Label>
                  <Textarea
                    value={field.description}
                    onChange={(e) => updateField(index, { description: e.target.value })}
                    placeholder="Enter field description"
                  />
                </div>

                {field.type === 'string' && (
                  <>
                    <div className={styles.twoCol}>
                      <div className="stack space-2">
                        <Label>Min Length</Label>
                        <Input
                          type="number"
                          value={field.minValue}
                          onChange={(e) => updateField(index, { minValue: e.target.value })}
                        />
                      </div>
                      <div className="stack space-2">
                        <Label>Max Length</Label>
                        <Input
                          type="number"
                          value={field.maxValue}
                          onChange={(e) => updateField(index, { maxValue: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className={styles.toggle}>
                      <Switch
                        checked={field.isTextarea}
                        onCheckedChange={(checked) => updateField(index, { isTextarea: checked })}
                      />
                      <Label>Render as Textarea</Label>
                    </div>
                    <div className={styles.toggle}>
                      <Switch
                        checked={field.showCharCount}
                        onCheckedChange={(checked) => updateField(index, { showCharCount: checked })}
                      />
                      <Label>Show Character Count</Label>
                    </div>
                  </>
                )}

                {field.type === 'number' && (
                  <>
                    <div className={styles.threeCol}>
                      <div className="stack space-2">
                        <Label>Min Value</Label>
                        <Input
                          type="number"
                          value={field.minValue}
                          onChange={(e) => updateField(index, { minValue: e.target.value })}
                        />
                      </div>
                      <div className="stack space-2">
                        <Label>Max Value</Label>
                        <Input
                          type="number"
                          value={field.maxValue}
                          onChange={(e) => updateField(index, { maxValue: e.target.value })}
                        />
                      </div>
                      <div className="stack space-2">
                        <Label>Step</Label>
                        <Input
                          type="number"
                          value={field.step}
                          onChange={(e) => updateField(index, { step: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className={styles.toggle}>
                      <Switch
                        checked={field.isSlider}
                        onCheckedChange={(checked) => updateField(index, { isSlider: checked })}
                      />
                      <Label>Render as Slider</Label>
                    </div>
                  </>
                )}

                {field.type === 'enum' && (
                  <div className="stack space-2">
                    <Label>Enum Options</Label>
                    <Input
                      value={field.enumOptions}
                      onChange={(e) => updateField(index, { enumOptions: e.target.value })}
                      placeholder="option1, option2, option3"
                    />
                  </div>
                )}

                <div className="stack space-2">
                  <Label>Default Value</Label>
                  <Input
                    value={field.defaultValue}
                    onChange={(e) => updateField(index, { defaultValue: e.target.value })}
                    placeholder="Enter default value"
                  />
                </div>

                <div className={styles.toggleRow}>
                  <div className={styles.toggle}>
                    <Switch
                      checked={field.isRequired}
                      onCheckedChange={(checked) => updateField(index, { isRequired: checked })}
                    />
                    <Label>Required</Label>
                  </div>
                  <div className={styles.toggle}>
                    <Switch
                      checked={field.isReadonly}
                      onCheckedChange={(checked) => updateField(index, { isReadonly: checked })}
                    />
                    <Label>Readonly</Label>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {fields.length === 0 && <p className={styles.empty}>No fields added yet. Click "Add Field" to get started.</p>}

          {fields.length > 0 && (
            <div className={styles.addRow}>
              <Button
                type="button"
                onClick={addField}
                size="sm"
              >
                <Plus />
                Add Field
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className={styles.footer}>
        <Button
          type="button"
          variant="outline"
          onClick={() => navigate({ to: '/admin/models', search: { tab: 'editing' } })}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isCreating || isUpdating}
        >
          {isCreating || isUpdating ? 'Saving...' : 'Save Model'}
        </Button>
      </div>
    </form>
  );
}
