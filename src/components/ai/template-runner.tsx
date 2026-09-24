import { ChevronLeft, Sparkles } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmented, type SegmentedItem } from '@/components/ui/segmented';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import type { TemplateGenerationItem } from '@/hooks/stores/template-generation-queue-store';
import { useTemplateGenerationHistory } from '@/hooks/use-template-generation-history';
import { useTemplateStreamGeneration } from '@/hooks/use-template-stream-generation';
import type { TemplateVariable } from '@/types/template';
import { Canvas, CanvasEmpty } from './canvas';
import { Field, FieldLabel, FieldName } from './field';
import { COUNTS } from './generation-options';
import type { ReferenceImage } from './reference-image';
import { ReferenceSlots } from './reference-slots';
import { type GenerationRun, RunList } from './run-list';
import { type AiTemplate, resolveTemplateVariables, variableOptions } from './template-data';
import styles from './template-runner.module.css';
import { resultDownloadFilename, useResultActions } from './use-result-actions';

interface TemplateRunnerProps {
  template: AiTemplate;
  onBack: () => void;
  references: ReferenceImage[];
  onReferencesChange: (references: ReferenceImage[]) => void;
  values: Record<string, unknown>;
  onValuesChange: (values: Record<string, unknown>) => void;
  count: number;
  onCountChange: (count: number) => void;
  onUseInEdit: (src: string) => void;
}

/** A batch is one press of Generate; its items are that batch's images. */
function toRun(items: TemplateGenerationItem[]): GenerationRun {
  const ordered = [...items].sort((a, b) => a.batchIndex - b.batchIndex);
  const first = ordered[0]!;
  const loading = ordered.some((item) => item.status === 'queued' || item.status === 'uploading' || item.status === 'processing');

  return {
    id: first.batchId,
    prompt: first.result?.finalPrompt ?? first.templateName,
    meta: first.templateName,
    createdAt: first.createdAt,
    loading,
    ratio: 1,
    references: first.inputPreviews ?? [],
    results: ordered.map((item) => ({ src: item.result?.resultImageUrl ?? null, error: item.error })),
  };
}

/** One control per template variable, typed the way the template declared it. */
function VariableControl({
  variable,
  value,
  onChange,
}: {
  variable: TemplateVariable;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (variable.type === 'dropdown') {
    const items: SegmentedItem<string>[] = variableOptions(variable).map((option) => ({ value: option.value, label: option.label }));
    return (
      <Segmented
        label={variable.label}
        items={items}
        value={String(value ?? items[0]?.value ?? '')}
        onValueChange={onChange}
        className={styles.segmented}
      />
    );
  }

  if (variable.type === 'boolean') {
    return (
      <Switch
        checked={Boolean(value)}
        onCheckedChange={onChange}
      />
    );
  }

  if (variable.type === 'number') {
    return (
      <Input
        id={`variable-${variable.name}`}
        type="number"
        className={styles.number}
        value={String(value ?? '')}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  return (
    <Input
      id={`variable-${variable.name}`}
      placeholder={variable.description ?? undefined}
      value={String(value ?? '')}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

/** The Templates tab once a template is chosen: a sticky form and its results. */
function TemplateRunner({
  template,
  onBack,
  references,
  onReferencesChange,
  values,
  onValuesChange,
  count,
  onCountChange,
  onUseInEdit,
}: TemplateRunnerProps) {
  const { generations } = useTemplateGenerationHistory();
  const { generate, cancel } = useTemplateStreamGeneration();
  const variables = React.useMemo(() => resolveTemplateVariables(template), [template]);
  const actions = useResultActions(React.useCallback(() => resultDownloadFilename(template.name), [template.name]));

  const runs = React.useMemo(() => {
    const batches = new Map<string, TemplateGenerationItem[]>();
    for (const item of generations) {
      if (item.templateId !== template.id) continue;
      const batch = batches.get(item.batchId);
      if (batch) batch.push(item);
      else batches.set(item.batchId, [item]);
    }
    return [...batches.values()].map(toRun).sort((a, b) => b.createdAt - a.createdAt);
  }, [generations, template.id]);

  // Only one batch is ever in flight, and it is the one Cancel aborts.
  const activeRun = runs.find((run) => run.loading);
  const busy = activeRun !== undefined;
  const missingRequired = variables.filter((variable) => {
    if (!variable.required) return false;
    const value = values[variable.name];
    return value === undefined || value === '' || value === '__NOTHING__';
  });

  const blocker =
    references.length < template.inputImageCount
      ? template.inputImageCount === 1
        ? 'Add a photo first'
        : `Add ${template.inputImageCount - references.length} more photos`
      : missingRequired.length > 0
        ? `Fill in ${missingRequired[0]!.label}`
        : null;

  const countItems: SegmentedItem<string>[] = COUNTS.map((value) => ({
    value: String(value),
    label: `${value}×`,
    disabled: value > template.maxImageCount,
    title: value > template.maxImageCount ? `This template makes up to ${template.maxImageCount} images` : undefined,
  }));

  const run = () => {
    if (blocker || busy) return;
    void generate({
      template: { id: template.id, name: template.name },
      images: references,
      variableValues: values,
      imageCount: count,
    });
  };

  return (
    <div className={styles.runner}>
      <div className={styles.form}>
        <button
          type="button"
          className={styles.back}
          onClick={onBack}
        >
          <ChevronLeft size={14} />
          All templates
        </button>

        <div>
          <h2 className={styles.name}>{template.name}</h2>
          {template.description && <p className={styles.description}>{template.description}</p>}
        </div>

        <Field>
          <FieldName>{template.inputImageCount === 1 ? 'Photo' : 'Photos'}</FieldName>
          <ReferenceSlots
            images={references}
            onChange={onReferencesChange}
            max={template.inputImageCount}
          />
        </Field>

        {variables.map((variable) => (
          <Field
            key={variable.name}
            row={variable.type === 'boolean'}
          >
            {variable.type === 'boolean' || variable.type === 'dropdown' ? (
              <FieldName>{variable.label}</FieldName>
            ) : (
              <FieldLabel htmlFor={`variable-${variable.name}`}>{variable.label}</FieldLabel>
            )}
            <VariableControl
              variable={variable}
              value={values[variable.name]}
              onChange={(value) => onValuesChange({ ...values, [variable.name]: value })}
            />
          </Field>
        ))}

        <Field>
          <FieldName>Images</FieldName>
          <Segmented
            label="Number of images"
            items={countItems}
            value={String(count)}
            onValueChange={(value) => onCountChange(Number(value))}
          />
        </Field>

        <div className={styles.actions}>
          <Button
            size="lg"
            className={styles.generate}
            disabled={blocker !== null || busy}
            onClick={run}
          >
            {busy ? <Spinner /> : <Sparkles />}
            {busy ? 'Generating…' : (blocker ?? 'Generate')}
          </Button>
          {activeRun && (
            <Button
              variant="ghost"
              size="sm"
              className={styles.generate}
              onClick={() => cancel({ batchId: activeRun.id })}
            >
              Cancel
            </Button>
          )}
        </div>
      </div>

      <Canvas className={styles.canvas}>
        {runs.length === 0 ? (
          <CanvasEmpty
            title="Results appear here"
            description={`Add ${template.inputImageCount === 1 ? 'a photo' : 'photos'}, adjust the options on the left and press Generate.`}
          />
        ) : (
          <RunList
            runs={runs}
            actions={actions}
            onUseInEdit={onUseInEdit}
            fileIdsReported={false}
          />
        )}
      </Canvas>
    </div>
  );
}

export { TemplateRunner };
