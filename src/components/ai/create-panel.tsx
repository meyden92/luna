import { SlidersHorizontal, Sparkles } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Segmented, type SegmentedItem } from '@/components/ui/segmented';
import { Spinner } from '@/components/ui/spinner';
import { type GenerationQueueItem, useImageGenerationQueueStore } from '@/hooks/stores/image-generation-queue-store';
import { useImageGeneration } from '@/hooks/use-image-generation';
import { useModelFieldDefaults } from '@/hooks/use-model-field-defaults';
import { Canvas, CanvasEmpty, IdeaChip } from './canvas';
import styles from './create-panel.module.css';
import {
  buildGenerationInput,
  COUNTS,
  countFromFieldValues,
  DEFAULT_STEPS,
  type GenerationModel,
  maxImagesPerRun,
  presetFieldValues,
  presetValuesFromFieldValues,
  promptFromFieldValues,
  qualityLabel,
  SHAPES,
  shapeFromFieldValues,
  stepsFromFieldValues,
} from './generation-options';
import type { GenerationSettings } from './generation-settings-sheet';
import { ModelSelect } from './model-select';
import { PresetMenu } from './preset-menu';
import { PromptCard, PromptCardAction, PromptCardBar, PromptCardHint, PromptCardInput } from './prompt-card';
import { type GenerationRun, RunList } from './run-list';
import { resultDownloadFilename, useResultActions } from './use-result-actions';

/** Starting points for someone facing an empty prompt. */
const IDEAS = [
  'A crescent moon over misty hills, soft mint light',
  'Cozy desk setup at night, film grain',
  'Minimal app icon, paper cut style',
];

interface CreatePanelProps {
  models: GenerationModel[];
  modelId: string;
  onModelChange: (modelId: string) => void;
  prompt: string;
  onPromptChange: (prompt: string) => void;
  shape: string;
  onShapeChange: (shape: string) => void;
  count: number;
  onCountChange: (count: number) => void;
  settings: GenerationSettings;
  onSettingsChange: (settings: GenerationSettings) => void;
  onOpenSettings: () => void;
  onUseInEdit: (src: string) => void;
  /** Folder finished results are filed into, for the empty state's promise. */
  saveToFolderName: string | null;
  promptRef: React.RefObject<HTMLTextAreaElement | null>;
}

/** Each shape option draws a small box in the proportions it selects. */
const SHAPE_ITEMS: SegmentedItem<string>[] = SHAPES.map((shape) => ({
  value: shape.value,
  title: shape.pixels,
  label: (
    <>
      <span
        aria-hidden
        className={styles.aspectBox}
        // Runtime values: the drawn box has to match this option's proportions.
        style={{ aspectRatio: shape.ratio, width: shape.ratio >= 1 ? 13 : 13 * shape.ratio + 2 }}
      />
      {shape.value}
    </>
  ),
}));

/** Turns a queued or finished generation into the run the canvas draws. */
function toRun(item: GenerationQueueItem): GenerationRun {
  const loading = item.status === 'queued' || item.status === 'processing';
  const shape = shapeFromFieldValues(item.fieldValues);
  const steps = stepsFromFieldValues(item.fieldValues);
  const results = item.result?.results ?? [];

  return {
    id: item.id,
    prompt: promptFromFieldValues(item.fieldValues, item.prompt),
    meta: [item.modelLabel, shape.value, steps === null ? null : qualityLabel(steps)].filter(Boolean).join(' · '),
    createdAt: item.createdAt,
    loading,
    ratio: shape.ratio,
    results: loading
      ? Array.from({ length: countFromFieldValues(item.fieldValues) }, () => ({ src: null }))
      : results.length > 0
        ? results.map((result) => ({ src: result.resultImageUrl ?? null, fileId: result.fileId, error: result.error }))
        : [{ src: null, error: item.error ?? 'Nothing came back' }],
  };
}

/** The Create tab: a prompt, the four choices that matter, and the results. */
function CreatePanel({
  models,
  modelId,
  onModelChange,
  prompt,
  onPromptChange,
  shape,
  onShapeChange,
  count,
  onCountChange,
  settings,
  onSettingsChange,
  onOpenSettings,
  onUseInEdit,
  saveToFolderName,
  promptRef,
}: CreatePanelProps) {
  /*
   * Create's runs are session state (§12): this is the live queue store, which
   * holds only what this session generated and is not persisted. Merging the
   * stored history in instead would make Create a second History tab — the empty
   * state and its example prompts would be unreachable forever after the first
   * generation, and every past image would mount and replay its rise animation.
   */
  const generations = useImageGenerationQueueStore((state) => state.generations);
  const { generate, cancel } = useImageGeneration();
  const [fieldDefaults, setFieldDefaults] = React.useState<Record<string, unknown>>({});

  const model = models.find((entry) => entry.id === modelId);
  const fields = React.useMemo(() => model?.fields ?? [], [model]);
  useModelFieldDefaults(fields, setFieldDefaults);

  const runs = React.useMemo(() => generations.map(toRun), [generations]);
  // Only one run is ever in flight, and it is the one Cancel aborts.
  const activeRun = runs.find((run) => run.loading);
  const busy = activeRun !== undefined;

  // A model that returns one image at a time cannot honour 2× or 4×, so those
  // options are disabled. The reason is said beside the control rather than in a
  // `title`: a disabled option takes no pointer events, so no tooltip can fire.
  const maxImages = maxImagesPerRun(fields);
  const countItems: SegmentedItem<string>[] = COUNTS.map((value) => ({
    value: String(value),
    label: `${value}×`,
    disabled: value > maxImages,
  }));
  const countHint =
    maxImages >= Math.max(...COUNTS)
      ? null
      : maxImages === 1
        ? `${model?.label ?? 'This model'} makes one image at a time`
        : `${model?.label ?? 'This model'} makes up to ${maxImages} images at a time`;
  // Switching to a single-image model must not leave a stale 4× standing.
  const effectiveCount = Math.min(count, maxImages);

  const actions = useResultActions(React.useCallback(() => resultDownloadFilename(model?.label ?? 'image'), [model]));

  const run = React.useCallback(() => {
    if (!model || !prompt.trim() || busy) return;

    const text = prompt.trim();
    const fieldValues = buildGenerationInput(fields, fieldDefaults, {
      prompt: text,
      shape,
      count: effectiveCount,
      steps: settings.steps,
      seed: settings.seed,
    });

    void generate({
      modelId: model.id,
      modelLabel: model.label,
      fieldValues,
      prompt: text,
      saveToFolderId: settings.saveToFolderId,
    });
  }, [busy, effectiveCount, fieldDefaults, fields, generate, model, prompt, settings, shape]);

  const currentPresetValues = React.useCallback(
    () => presetFieldValues(fields, { shape, count: effectiveCount, steps: settings.steps, seed: settings.seed }),
    [effectiveCount, fields, settings, shape],
  );

  // A preset only moves the controls it holds; the folder setting is not part of one.
  const applyPreset = React.useCallback(
    (fieldValues: Record<string, unknown>) => {
      const preset = presetValuesFromFieldValues(fieldValues);
      if (preset.shape) onShapeChange(preset.shape);
      if (preset.count) onCountChange(preset.count);
      onSettingsChange({ ...settings, steps: preset.steps ?? settings.steps, seed: preset.seed });
    },
    [onCountChange, onSettingsChange, onShapeChange, settings],
  );

  const fillPrompt = (text: string) => {
    onPromptChange(text);
    promptRef.current?.focus();
  };

  return (
    <>
      <PromptCard>
        <PromptCardInput
          ref={promptRef}
          value={prompt}
          placeholder="Describe the image you want…"
          autoFocus
          aria-label="Prompt"
          onChange={(event) => onPromptChange(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault();
              run();
            }
          }}
        />
        <PromptCardBar>
          <ModelSelect
            models={models}
            value={modelId}
            onValueChange={onModelChange}
          />

          <Segmented
            label="Shape"
            items={SHAPE_ITEMS}
            value={shape}
            onValueChange={onShapeChange}
          />

          <Segmented
            label="Number of images"
            items={countItems}
            value={String(effectiveCount)}
            onValueChange={(value) => onCountChange(Number(value))}
          />
          {countHint && <PromptCardHint>{countHint}</PromptCardHint>}

          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenSettings}
          >
            <SlidersHorizontal size={14} />
            {qualityLabel(settings.steps)}
            {(settings.steps !== DEFAULT_STEPS || settings.seed.trim() !== '') && (
              <span
                aria-hidden
                className={styles.changed}
              />
            )}
          </Button>

          {model && (
            <PresetMenu
              modelId={model.id}
              modelLabel={model.label}
              currentFieldValues={currentPresetValues}
              onApply={applyPreset}
            />
          )}

          <PromptCardAction>
            {activeRun ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => cancel(activeRun.id)}
              >
                Cancel
              </Button>
            ) : (
              <PromptCardHint>⌘ ↵</PromptCardHint>
            )}
            <Button
              onClick={run}
              disabled={!prompt.trim() || busy || !model}
            >
              {busy ? <Spinner /> : <Sparkles />}
              {busy ? 'Generating…' : 'Generate'}
            </Button>
          </PromptCardAction>
        </PromptCardBar>
      </PromptCard>

      <Canvas>
        {runs.length === 0 ? (
          <CanvasEmpty
            title="Your images will appear here"
            description={`Write a prompt above and press Generate. Results are saved to ${saveToFolderName ?? 'your files'} automatically.`}
          >
            {IDEAS.map((idea) => (
              <IdeaChip
                key={idea}
                onClick={() => fillPrompt(idea)}
              >
                {idea}
              </IdeaChip>
            ))}
          </CanvasEmpty>
        ) : (
          <RunList
            runs={runs}
            actions={actions}
            onUseInEdit={onUseInEdit}
            onReuse={(reused) => fillPrompt(reused.prompt)}
          />
        )}
      </Canvas>
    </>
  );
}

export { CreatePanel };
