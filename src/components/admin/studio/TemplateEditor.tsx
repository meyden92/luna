import { useNavigate } from '@tanstack/react-router';
import { FileInput, ImagePlus, Save, Trash2, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SortableList } from '@/components/ui/sortable-list';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useAppMutation } from '@/hooks/use-app-mutation';
import { useConfirmation } from '@/hooks/use-confirmation';
import { queryKeys } from '@/libs/query-keys';
import { fieldKind, suggestAccept } from '@/libs/studio/model-config';
import { fileInputs, templateFieldDefaults, validateTemplateConfig } from '@/libs/studio/template-config';
import type { FieldConfig, VariableConfig } from '@/libs/studio/types';
import { reconcileVariables, writeVariableTokens } from '@/libs/studio/variables';
import type { listStudioCategories, listStudioModels } from '@/server/fns/admin/studio';
import { deleteStudioTemplate, saveStudioTemplate } from '@/server/fns/admin/studio-templates';
import { FieldCard } from './FieldCard';
import styles from './ModelEditor.module.css';
import { ModelPreview } from './ModelPreview';
import previewStyles from './TemplateEditor.module.css';
import { TemplateTextEditor } from './TemplateTextEditor';
import { VariableCard, variableCandidates } from './VariableCard';

type Model = Awaited<ReturnType<typeof listStudioModels>>[number];
type Category = Awaited<ReturnType<typeof listStudioCategories>>[number];

/** A preview image in the editor: kept, newly uploaded, or taken from a test run's Output. */
export type EditorPreview =
  | { source: 'key'; key: string; url: string }
  | { source: 'upload'; key: string; file: File; url: string }
  | { source: 'output'; outputId: string; url: string };

/** What the editor starts from: a saved Template, or a new one (maybe from a Generation). */
export interface TemplateDraft {
  id?: string;
  modelId: string | null;
  categoryId: string | null;
  name: string;
  description: string;
  isActive: boolean;
  fields: FieldConfig[];
  variables: VariableConfig[];
  previews: EditorPreview[];
}

const MAX_PREVIEWS = 6;

/** The fixed texts of the Field cards, in card order: where Variables live. */
const textsOf = (fields: FieldConfig[]) =>
  fields.flatMap((field) => (field.mode === 'fixed' && typeof field.value === 'string' ? [field.value] : []));

/** The cards with their fixed texts replaced, in the order `textsOf` read them. */
function withTexts(fields: FieldConfig[], texts: string[]): FieldConfig[] {
  let at = 0;
  return fields.map((field) =>
    field.mode === 'fixed' && typeof field.value === 'string' ? { ...field, value: texts[at++] as string } : field,
  );
}

/**
 * Creates or edits a Template: its Model, Category and details, the Field
 * cards (fixed by default, text with `{variables}`), preview images, and the
 * Variable sidebar whose cards follow the texts, next to the same live
 * preview and *Test* as the Model editor. Delete and Save sit in an action
 * bar that sticks to the bottom of the window.
 */
export function TemplateEditor({ draft, models, categories }: { draft: TemplateDraft; models: Model[]; categories: Category[] }) {
  const id = useId();
  const navigate = useNavigate();
  const [modelId, setModelId] = useState(draft.modelId);
  const [categoryId, setCategoryId] = useState(draft.categoryId);
  const [name, setName] = useState(draft.name);
  const [description, setDescription] = useState(draft.description);
  const [isActive, setIsActive] = useState(draft.isActive);
  const [previews, setPreviews] = useState(draft.previews);
  const previewsRef = useRef(previews);
  previewsRef.current = previews;
  useEffect(() => () => revokeUploads(previewsRef.current), []);
  const [config, setConfig] = useState(() => ({
    fields: [...draft.fields].sort((a, b) => a.order - b.order),
    variables: reconcileVariables(textsOf(draft.fields), draft.variables),
  }));
  const { confirm, ConfirmationDialog } = useConfirmation<null>();

  const model = models.find((candidate) => candidate.id === modelId);
  const schema = model?.schemaSnapshot.input;
  const { fields, variables } = config;
  const issues = useMemo(() => (schema ? validateTemplateConfig({ fields, variables, input: schema }) : []), [fields, variables, schema]);
  const issuesOf = (name: string) => issues.filter((issue) => issue.field === name).map((issue) => issue.message);
  const cardNames = new Set([...fields.map((field) => field.name), ...variables.map((variable) => variable.name)]);
  const looseIssues = issues.filter((issue) => !cardNames.has(issue.field));
  const textNames = variables.filter((variable) => variable.kind !== 'file').map((variable) => variable.name);
  const blocker = !model
    ? 'Choose a model to start.'
    : !categoryId
      ? 'Choose a category.'
      : !name.trim()
        ? 'Give the Template a name.'
        : issues.length > 0
          ? `Fix ${issues.length === 1 ? 'the issue' : `the ${issues.length} issues`} on the cards to save.`
          : null;

  const save = useAppMutation(saveStudioTemplate, {
    invalidates: [queryKeys.adminStudio.templates, queryKeys.adminStudio.categories, queryKeys.studio.catalog],
    successMessage: 'Template saved',
    onSuccess: (saved) => {
      if (!draft.id) navigate({ to: '/admin/studio/templates/$id', params: { id: saved.id } });
    },
  });
  const remove = useAppMutation(deleteStudioTemplate, {
    invalidates: [queryKeys.adminStudio.templates, queryKeys.adminStudio.categories, queryKeys.studio.catalog],
    successMessage: 'Template deleted',
    onSuccess: () => navigate({ to: '/admin/studio/templates' }),
  });

  const setFields = (next: FieldConfig[]) =>
    setConfig((current) => ({ fields: next, variables: reconcileVariables(textsOf(next), current.variables) }));
  const setField = (next: FieldConfig) => setFields(fields.map((field) => (field.name === next.name ? next : field)));
  /** A card edit also writes its options and default back into the texts. */
  const setVariable = (previousName: string, next: VariableConfig) =>
    setConfig((current) => {
      const nextVariables = current.variables.map((variable) => (variable.name === previousName ? next : variable));
      const nextFields =
        next.kind === 'file' ? current.fields : withTexts(current.fields, writeVariableTokens(textsOf(current.fields), next));
      return { fields: nextFields, variables: reconcileVariables(textsOf(nextFields), nextVariables) };
    });

  const chooseModel = (nextId: string) => {
    const next = models.find((candidate) => candidate.id === nextId);
    if (!next) return;
    setModelId(next.id);
    setCategoryId((current) => current ?? next.categoryId);
    setConfig({ fields: templateFieldDefaults(next.fields, next.schemaSnapshot.input), variables: [] });
  };

  /** *Add file input*: a required file Variable on the first file input, at its next free position. The Variable owns that input from then on. */
  const addFileVariable = () => {
    if (!schema) return;
    const [target] = fileInputs(schema);
    if (!target) return;
    const taken = new Set(variables.map((variable) => variable.name));
    let index = 1;
    while (taken.has(index === 1 ? 'file' : `file_${index}`)) index++;
    const used = variables.filter((variable) => variable.file?.field === target.name).map((variable) => variable.file?.position ?? 0);
    const accept = fields.find((candidate) => candidate.name === target.name)?.accept;
    const variable: VariableConfig = {
      name: index === 1 ? 'file' : `file_${index}`,
      kind: 'file',
      required: true,
      order: Math.max(-1, ...variables.map((other) => other.order)) + 1,
      file: {
        field: target.name,
        accept: accept ?? suggestAccept(target.name),
        ...(target.list ? { position: used.length === 0 ? 0 : Math.max(...used) + 1 } : {}),
      },
    };
    setConfig((current) => ({ ...current, variables: [...current.variables, variable] }));
  };

  const submit = () => {
    if (!modelId || !categoryId) return;
    const data = new FormData();
    data.set(
      'payload',
      JSON.stringify({
        ...(draft.id ? { id: draft.id } : {}),
        modelId,
        categoryId,
        name,
        description: description.trim() || null,
        isActive,
        fields: fields.map((field, order) => ({ ...field, order })),
        variables: variables.map((variable, order) => ({ ...variable, order })),
        previews: previews.map((preview) =>
          preview.source === 'output' ? { source: 'output', outputId: preview.outputId } : { source: preview.source, key: preview.key },
        ),
      }),
    );
    for (const preview of previews) if (preview.source === 'upload') data.append(preview.key, preview.file, preview.file.name);
    save.mutate(data);
  };

  return (
    <div className="stack space-6">
      <div className={styles.header}>
        <div>
          <h1 className="type-2xl weight-bold">{draft.id ? draft.name : 'New template'}</h1>
          {model && (
            <p className={styles.muted}>
              {model.name} · <span className="type-mono">{model.endpointId}</span>
            </p>
          )}
        </div>
      </div>

      <div className={styles.layout}>
        <div className="stack space-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="stack space-4">
              <div className={styles.grid}>
                <div className="stack space-2">
                  <Label htmlFor={`${id}-model`}>Model</Label>
                  <Select
                    items={models.map((candidate) => ({ value: candidate.id, label: candidate.name }))}
                    value={modelId}
                    disabled={Boolean(draft.id)}
                    onValueChange={(value) => value && chooseModel(value)}
                  >
                    <SelectTrigger id={`${id}-model`}>
                      <SelectValue placeholder="Choose a model…" />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map((candidate) => (
                        <SelectItem
                          key={candidate.id}
                          value={candidate.id}
                        >
                          {candidate.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="stack space-2">
                  <Label htmlFor={`${id}-category`}>Category</Label>
                  <Select
                    items={categories.map((category) => ({ value: category.id, label: category.name }))}
                    value={categoryId}
                    onValueChange={(value) => value && setCategoryId(value)}
                  >
                    <SelectTrigger id={`${id}-category`}>
                      <SelectValue placeholder="Choose a category…" />
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
                <div className="stack space-2">
                  <Label htmlFor={`${id}-name`}>Name</Label>
                  <Input
                    id={`${id}-name`}
                    value={name}
                    maxLength={120}
                    onChange={(event) => setName(event.target.value)}
                  />
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

          {model && schema && (
            <Card>
              <CardHeader>
                <CardTitle>Fields</CardTitle>
                <CardDescription>
                  One card per input of the model. Pick for each: User input (Users fill it in), Fixed value (always sent as set here) or
                  fal default (left to fal). To ask Users for just a part of a fixed text, write {'{name}'} or {'{name: A | *B}'} in it: the
                  Variable's card appears on the right.
                </CardDescription>
              </CardHeader>
              <CardContent className="stack space-4">
                {looseIssues.length > 0 && (
                  <ul className={styles.issues}>
                    {looseIssues.map((issue) => (
                      <li key={`${issue.field}: ${issue.message}`}>{`${issue.field}: ${issue.message}`}</li>
                    ))}
                  </ul>
                )}
                <SortableList
                  items={fields}
                  getId={(field) => field.name}
                  onReorder={(ordered) => setFields(ordered.map((field, order) => ({ ...field, order })))}
                  renderItem={(field, handle) => {
                    const property = schema.properties?.[field.name] ?? {};
                    const isText = field.mode === 'fixed' && fieldKind(field, property) === 'string';
                    const feeders = variables.filter((variable) => variable.file?.field === field.name).map((variable) => variable.name);
                    return (
                      <FieldCard
                        field={field}
                        schema={schema}
                        fields={fields}
                        issues={issuesOf(field.name)}
                        onChange={setField}
                        handle={handle}
                        variableCandidates={variableCandidates(variables)}
                        filledBy={feeders}
                        valueEditor={
                          isText ? (
                            <TemplateTextEditor
                              id={`${id}-text-${field.name}`}
                              label="Value"
                              value={typeof field.value === 'string' ? field.value : ''}
                              names={textNames}
                              onChange={(value) => setField({ ...field, value })}
                            />
                          ) : undefined
                        }
                      />
                    );
                  }}
                />
              </CardContent>
            </Card>
          )}

          <PreviewImages
            previews={previews}
            onChange={setPreviews}
          />
        </div>

        {model && schema && (
          <div className="stack space-6">
            <Card>
              <CardHeader>
                <CardTitle>Variables</CardTitle>
                <CardDescription>
                  The blanks Users fill in on top of the User input Fields. Text Variables come and go with the {'{names}'} in the fixed
                  texts. A file input asks Users for a file and sends it to one of the model's file inputs, which it then fills on its own.
                </CardDescription>
              </CardHeader>
              <CardContent className="stack space-4">
                {variables.length === 0 && <p className={styles.muted}>No Variables yet.</p>}
                <SortableList
                  items={variables}
                  getId={(variable) => variable.name}
                  onReorder={(ordered) =>
                    setConfig((current) => ({ ...current, variables: ordered.map((variable, order) => ({ ...variable, order })) }))
                  }
                  renderItem={(variable, handle) => (
                    <VariableCard
                      variable={variable}
                      variables={variables}
                      fields={fields}
                      schema={schema}
                      issues={issuesOf(variable.name)}
                      onChange={(next) => setVariable(variable.name, next)}
                      onRemove={() =>
                        setConfig((current) => ({ ...current, variables: current.variables.filter((other) => other !== variable) }))
                      }
                      handle={handle}
                    />
                  )}
                />
                <Button
                  variant="outline"
                  disabled={fileInputs(schema).length === 0}
                  onClick={addFileVariable}
                >
                  <FileInput />
                  Add file input
                </Button>
              </CardContent>
            </Card>

            <ModelPreview
              modelId={model.id}
              fields={fields}
              variables={variables}
              schema={schema}
              pricing={model.pricing}
              disabledReason={issues.length > 0 ? 'Fix the issues on the cards to test.' : null}
              onUseOutput={(output) =>
                output.url &&
                setPreviews((current) =>
                  current.some((preview) => preview.source === 'output' && preview.outputId === output.id)
                    ? current
                    : [...current, { source: 'output' as const, outputId: output.id, url: output.url as string }].slice(0, MAX_PREVIEWS),
                )
              }
            />
          </div>
        )}
      </div>
      <div
        className={previewStyles.actions}
        role="toolbar"
        aria-label="Template actions"
      >
        <p className={styles.muted}>{blocker}</p>
        <div className="cluster space-2">
          {draft.id && (
            <Button
              variant="outline"
              onClick={() =>
                confirm({
                  title: `Delete ${draft.name}?`,
                  description: 'Users can no longer run it. Their Generations stay in their history.',
                  data: null,
                  onConfirm: () => remove.mutate({ id: draft.id as string }),
                })
              }
            >
              <Trash2 />
              Delete
            </Button>
          )}
          <Button
            disabled={blocker !== null || save.isPending}
            onClick={submit}
          >
            <Save />
            Save
          </Button>
        </div>
      </div>
      <ConfirmationDialog />
    </div>
  );
}

/** Frees the object URLs of uploaded previews; the others point at stored files. */
function revokeUploads(previews: readonly EditorPreview[]) {
  for (const preview of previews) if (preview.source === 'upload') URL.revokeObjectURL(preview.url);
}

/** The Template's preview images, as its card in the Studio shows the first: upload one, or take a test run's Output. */
function PreviewImages({ previews, onChange }: { previews: EditorPreview[]; onChange: (previews: EditorPreview[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Preview images</CardTitle>
        <CardDescription>
          The first one is the Template's picture in the Studio. Upload one, or use an Output of a test run.
        </CardDescription>
      </CardHeader>
      <CardContent className="stack space-4">
        {previews.length > 0 && (
          <ul
            className={previewStyles.previews}
            aria-label="Preview images"
          >
            {previews.map((preview, index) => (
              <li
                key={preview.url}
                className={previewStyles.preview}
              >
                <img
                  src={preview.url}
                  alt={`Preview ${index + 1}`}
                />
                <Button
                  variant="secondary"
                  size="icon-xs"
                  className={previewStyles.removePreview}
                  aria-label={`Remove preview ${index + 1}`}
                  onClick={() => {
                    revokeUploads([preview]);
                    onChange(previews.filter((candidate) => candidate !== preview));
                  }}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div>
          <input
            ref={input}
            type="file"
            aria-label="Preview image file"
            accept="image/*"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              const key = `preview.${crypto.randomUUID()}`;
              onChange([...previews, { source: 'upload' as const, key, file, url: URL.createObjectURL(file) }].slice(0, MAX_PREVIEWS));
            }}
          />
          <Button
            variant="outline"
            disabled={previews.length >= MAX_PREVIEWS}
            onClick={() => input.current?.click()}
          >
            <ImagePlus />
            Upload image
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
