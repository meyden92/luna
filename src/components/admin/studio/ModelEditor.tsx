import { useNavigate } from '@tanstack/react-router';
import { Save, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Segmented } from '@/components/ui/segmented';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SortableList } from '@/components/ui/sortable-list';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useAppMutation } from '@/hooks/use-app-mutation';
import { useConfirmation } from '@/hooks/use-confirmation';
import { queryKeys } from '@/libs/query-keys';
import { formatPrice } from '@/libs/studio/format';
import { validateModelConfig } from '@/libs/studio/model-config';
import type { FieldConfig, StudioPricing } from '@/libs/studio/types';
import { deleteStudioModel, type getStudioModel, type listStudioCategories, updateStudioModel } from '@/server/fns/admin/studio';
import { FieldCard } from './FieldCard';
import styles from './ModelEditor.module.css';
import { ModelPreview } from './ModelPreview';
import { SchemaDriftCard } from './SchemaDriftCard';

type Model = Awaited<ReturnType<typeof getStudioModel>>;
type Category = Awaited<ReturnType<typeof listStudioCategories>>[number];

/**
 * Edits one Model: its fal schema's drift, its details, the Field cards
 * (ordered by drag and drop), the pricing quantity and the active switch,
 * next to a live preview of the User's form. Save is refused while any card
 * has an issue.
 */
export function ModelEditor({ model, categories }: { model: Model; categories: Category[] }) {
  const id = useId();
  const navigate = useNavigate();
  const [name, setName] = useState(model.name);
  const [description, setDescription] = useState(model.description ?? '');
  const [categoryId, setCategoryId] = useState(model.categoryId);
  const [isActive, setIsActive] = useState(model.isActive);
  const [fields, setFields] = useState(() => [...model.fields].sort((a, b) => a.order - b.order));
  const [quantity, setQuantity] = useState(model.pricing?.quantity ?? null);
  const { confirm, ConfirmationDialog } = useConfirmation<null>();

  const schema = model.schemaSnapshot.input;
  const pricing: StudioPricing | null = model.pricing && quantity ? { ...model.pricing, quantity } : model.pricing;
  const issues = validateModelConfig(fields, schema, pricing);
  const issuesOf = (name: string) => issues.filter((issue) => issue.field === name).map((issue) => issue.message);

  const save = useAppMutation(updateStudioModel, {
    invalidates: [queryKeys.adminStudio.model(model.id), queryKeys.adminStudio.models, queryKeys.adminStudio.categories],
    successMessage: 'Model saved',
  });
  const remove = useAppMutation(deleteStudioModel, {
    invalidates: [queryKeys.adminStudio.models, queryKeys.adminStudio.categories],
    successMessage: 'Model deleted',
    onSuccess: () => navigate({ to: '/admin/studio/models' }),
  });

  const unsaved =
    JSON.stringify([
      name,
      description.trim() || null,
      categoryId,
      isActive,
      fields.map((field, order) => ({ ...field, order })),
      quantity,
    ]) !==
    JSON.stringify([
      model.name,
      model.description,
      model.categoryId,
      model.isActive,
      [...model.fields].sort((a, b) => a.order - b.order).map((field, order) => ({ ...field, order })),
      model.pricing?.quantity ?? null,
    ]);

  const setField = (next: FieldConfig) => setFields((current) => current.map((field) => (field.name === next.name ? next : field)));

  return (
    <div className="stack space-6">
      <div className={styles.header}>
        <div>
          <h1 className="type-2xl weight-bold">{model.name}</h1>
          <p className={styles.muted}>
            <span className="type-mono">{model.endpointId}</span>
          </p>
        </div>
        <div className="cluster space-2">
          <Button
            variant="outline"
            onClick={() =>
              confirm({
                title: `Delete ${model.name}?`,
                description: 'Users can no longer run it. Their Generations stay in their history.',
                data: null,
                onConfirm: () => remove.mutate({ id: model.id }),
              })
            }
          >
            <Trash2 />
            Delete
          </Button>
          <Button
            disabled={issues.length > 0 || !name.trim() || save.isPending}
            onClick={() =>
              save.mutate({
                id: model.id,
                name,
                description: description.trim() || null,
                categoryId,
                isActive,
                fields: fields.map((field, order) => ({ ...field, order })),
                quantity,
              })
            }
          >
            <Save />
            Save
          </Button>
        </div>
      </div>

      <div className={styles.layout}>
        <div className="stack space-6">
          <SchemaDriftCard
            model={model}
            unsaved={unsaved}
          />

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="stack space-4">
              <div className={styles.grid}>
                <div className="stack space-2">
                  <Label htmlFor={`${id}-name`}>Name</Label>
                  <Input
                    id={`${id}-name`}
                    value={name}
                    maxLength={120}
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>
                <div className="stack space-2">
                  <Label htmlFor={`${id}-category`}>Category</Label>
                  <Select
                    items={categories.map((category) => ({ value: category.id, label: category.name }))}
                    value={categoryId}
                    onValueChange={(value) => value && setCategoryId(value)}
                  >
                    <SelectTrigger id={`${id}-category`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem
                          key={category.id}
                          value={category.id}
                        >
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="stack space-2">
                <Label htmlFor={`${id}-description`}>Description</Label>
                <Textarea
                  id={`${id}-description`}
                  value={description}
                  maxLength={1000}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
              <div className={styles.switchRow}>
                <Label htmlFor={`${id}-active`}>Active: Users see it in the Studio</Label>
                <Switch
                  id={`${id}-active`}
                  checked={isActive}
                  onCheckedChange={setIsActive}
                />
              </div>
            </CardContent>
          </Card>

          <PricingCard
            pricing={model.pricing}
            quantity={quantity}
            fieldNames={fields.map((field) => field.name)}
            issues={issuesOf('pricing')}
            onChange={setQuantity}
          />

          <Card>
            <CardHeader>
              <CardTitle>Fields</CardTitle>
              <CardDescription>
                One card per input of the model. User input is what Users fill in; a fixed value is always sent as set here; fal default
                leaves it to fal. Drag a card by its handle to reorder.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SortableList
                items={fields}
                getId={(field) => field.name}
                onReorder={(ordered) => setFields(ordered.map((field, order) => ({ ...field, order })))}
                renderItem={(field, handle) => (
                  <FieldCard
                    field={field}
                    schema={schema}
                    fields={fields}
                    issues={issuesOf(field.name)}
                    onChange={setField}
                    handle={handle}
                  />
                )}
              />
            </CardContent>
          </Card>
        </div>

        <ModelPreview
          modelId={model.id}
          fields={fields}
          schema={schema}
          pricing={pricing}
          disabledReason={issues.length > 0 ? 'Fix the issues on the cards to test.' : null}
        />
      </div>
      <ConfirmationDialog />
    </div>
  );
}

/** fal's unit price, and what one request counts as: a fixed number of units, or a Field's value. */
function PricingCard({
  pricing,
  quantity,
  fieldNames,
  issues,
  onChange,
}: {
  pricing: StudioPricing | null;
  quantity: StudioPricing['quantity'] | null;
  fieldNames: string[];
  issues: string[];
  onChange: (quantity: StudioPricing['quantity']) => void;
}) {
  const id = useId();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pricing</CardTitle>
        <CardDescription>
          {pricing ? `fal charges ${formatPrice(pricing)}.` : 'fal states no price for this endpoint, so Generations have no estimate.'}
        </CardDescription>
      </CardHeader>
      {pricing && quantity && (
        <CardContent className="stack space-4">
          <Segmented
            label="Quantity per request"
            value={quantity.kind}
            onValueChange={(kind) =>
              onChange(kind === 'fixed' ? { kind: 'fixed', value: 1 } : { kind: 'field', field: fieldNames[0] ?? '' })
            }
            items={[
              { value: 'fixed', label: `Fixed number of ${pricing.unit}s` },
              { value: 'field', label: 'Read from a Field' },
            ]}
          />
          {quantity.kind === 'fixed' ? (
            <div className="stack space-2">
              <Label htmlFor={`${id}-units`}>Units per request</Label>
              <Input
                id={`${id}-units`}
                type="number"
                min={0}
                step="any"
                value={quantity.value}
                onChange={(event) => onChange({ kind: 'fixed', value: Number(event.target.value) })}
              />
            </div>
          ) : (
            <div className={styles.grid}>
              <div className="stack space-2">
                <Label htmlFor={`${id}-field`}>Field</Label>
                <Select
                  items={fieldNames.map((name) => ({ value: name, label: name }))}
                  value={quantity.field}
                  onValueChange={(field) => field && onChange({ ...quantity, field })}
                >
                  <SelectTrigger id={`${id}-field`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {fieldNames.map((name) => (
                      <SelectItem
                        key={name}
                        value={name}
                      >
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="stack space-2">
                <Label htmlFor={`${id}-factor`}>Units per value</Label>
                <Input
                  id={`${id}-factor`}
                  type="number"
                  min={0}
                  step="any"
                  placeholder="1"
                  value={quantity.factor ?? ''}
                  onChange={(event) =>
                    onChange({
                      kind: 'field',
                      field: quantity.field,
                      ...(event.target.value ? { factor: Number(event.target.value) } : {}),
                    })
                  }
                />
              </div>
            </div>
          )}
          {issues.length > 0 && (
            <ul className={styles.issues}>
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
        </CardContent>
      )}
    </Card>
  );
}
