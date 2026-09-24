import { Wand2 } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Segmented, type SegmentedItem } from '@/components/ui/segmented';
import { Spinner } from '@/components/ui/spinner';
import type { GenerationItem } from '@/hooks/stores/image-editor-queue-store';
import { useImageEditHistory } from '@/hooks/use-ai-generation-history';
import { useEditImageGeneration } from '@/hooks/use-edit-image-generation';
import { useModelFieldDefaults } from '@/hooks/use-model-field-defaults';
import { Canvas, CanvasEmpty } from './canvas';
import { COUNTS, type GenerationModel, promptFromFieldValues } from './generation-options';
import { PromptCard, PromptCardAction, PromptCardBar, PromptCardHint, PromptCardInput, PromptCardSlots } from './prompt-card';
import { type ReferenceImage, referenceImagesFromUrls } from './reference-image';
import { ReferenceSlots } from './reference-slots';
import { type GenerationRun, RunList } from './run-list';
import { resultDownloadFilename, useResultActions } from './use-result-actions';

const MAX_REFERENCES = 4;

const COUNT_ITEMS: SegmentedItem<string>[] = COUNTS.map((value) => ({ value: String(value), label: `${value}×` }));

interface EditPanelProps {
  models: GenerationModel[];
  references: ReferenceImage[];
  onReferencesChange: (references: ReferenceImage[]) => void;
  prompt: string;
  onPromptChange: (prompt: string) => void;
  count: number;
  onCountChange: (count: number) => void;
  onUseInEdit: (src: string) => void;
  /** Folder the edited images are filed into, shared with Create's settings. */
  saveToFolderId: string | null;
}

/** Turns a queued or finished edit into the run the canvas draws. */
function toRun(item: GenerationItem): GenerationRun {
  const loading = item.status === 'queued' || item.status === 'uploading' || item.status === 'processing';
  const references = item.inputPreviews ?? [];
  const results = item.result?.results ?? [];
  const expected = item.imageCount ?? 1;

  return {
    id: item.id,
    prompt: promptFromFieldValues(item.fieldValues, 'Edit'),
    meta: [item.modelLabel, references.length === 1 ? '1 reference' : `${references.length} references`].join(' · '),
    createdAt: item.createdAt,
    loading,
    ratio: 1,
    references,
    results: loading
      ? Array.from({ length: expected }, () => ({ src: null }))
      : results.length > 0
        ? results.map((result) => ({ src: result.resultImageUrl ?? null, fileId: result.fileId, error: result.error }))
        : [{ src: null, error: item.error ?? 'Nothing came back' }],
  };
}

/** The Edit tab: reference images plus a description of the change to make. */
function EditPanel({
  models,
  references,
  onReferencesChange,
  prompt,
  onPromptChange,
  count,
  onCountChange,
  onUseInEdit,
  saveToFolderId,
}: EditPanelProps) {
  const { generations } = useImageEditHistory();
  const { generate, cancel } = useEditImageGeneration();
  const [fieldDefaults, setFieldDefaults] = React.useState<Record<string, unknown>>({});

  const model = models[0];
  const fields = React.useMemo(() => model?.fields ?? [], [model]);
  useModelFieldDefaults(fields, setFieldDefaults);

  const runs = React.useMemo(() => generations.map(toRun), [generations]);
  // Only one edit is ever in flight, and it is the one Cancel aborts.
  const activeRun = runs.find((run) => run.loading);
  const busy = activeRun !== undefined;
  const actions = useResultActions(React.useCallback(() => resultDownloadFilename(model?.label ?? 'edit'), [model]));

  // Said next to the button, so the reason it is dark is never a guess.
  const blocker = !model
    ? 'No editing model is available'
    : references.length === 0
      ? 'Add a reference image first'
      : !prompt.trim()
        ? 'Describe the change'
        : null;

  const run = React.useCallback(
    (text: string, images: ReferenceImage[], imageCount: number) => {
      if (!model || !text.trim() || images.length === 0 || busy) return;
      void generate({
        images,
        modelId: model.id,
        modelLabel: model.label,
        fieldValues: { ...fieldDefaults, prompt: text.trim() },
        imageCount,
        saveToFolderId,
      });
    },
    [busy, fieldDefaults, generate, model, saveToFolderId],
  );

  /**
   * Retry re-uploads the run's references: the `File`s it was given may be gone
   * (a reload drops them), but their stored previews are still fetchable.
   */
  const retry = React.useCallback(
    (item: GenerationRun) => {
      const source = generations.find((entry) => entry.id === item.id);
      if (!source) return;

      void (async () => {
        try {
          const images =
            source.inputImages && source.inputImages.length > 0
              ? source.inputImages
              : await referenceImagesFromUrls(source.inputPreviews ?? [], `retry-${source.id}`);
          if (images.length === 0) {
            toast.error('Those reference images are no longer available');
            return;
          }
          run(item.prompt, images, source.imageCount ?? 1);
        } catch {
          toast.error('Could not prepare the reference images');
        }
      })();
    },
    [generations, run],
  );

  return (
    <>
      <PromptCard>
        <PromptCardSlots>
          <ReferenceSlots
            images={references}
            onChange={onReferencesChange}
            max={MAX_REFERENCES}
          />
        </PromptCardSlots>
        <PromptCardInput
          compact
          value={prompt}
          placeholder="Describe the change… e.g. make the sky pink, remove the text"
          aria-label="Change to make"
          onChange={(event) => onPromptChange(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault();
              run(prompt, references, count);
            }
          }}
        />
        <PromptCardBar>
          <Segmented
            label="Number of images"
            items={COUNT_ITEMS}
            value={String(count)}
            onValueChange={(value) => onCountChange(Number(value))}
          />
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
              <PromptCardHint>{blocker ?? '⌘ ↵'}</PromptCardHint>
            )}
            <Button
              onClick={() => run(prompt, references, count)}
              disabled={blocker !== null || busy}
            >
              {busy ? <Spinner /> : <Wand2 />}
              {busy ? 'Editing…' : 'Apply edit'}
            </Button>
          </PromptCardAction>
        </PromptCardBar>
      </PromptCard>

      <Canvas>
        {runs.length === 0 ? (
          <CanvasEmpty
            title="Change an existing image"
            description="Add one to four reference images, describe what should change, and get new versions side by side."
          />
        ) : (
          <RunList
            runs={runs}
            actions={actions}
            onUseInEdit={onUseInEdit}
            onReuse={(reused) => onPromptChange(reused.prompt)}
            onRetry={retry}
          />
        )}
      </Canvas>
    </>
  );
}

export { EditPanel };
