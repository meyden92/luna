import * as React from 'react';
import { toast } from 'sonner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFolders } from '@/contexts/FoldersContext';
import { startViewTransition } from '@/libs/view-transition';
import { CreatePanel } from './create-panel';
import { EditPanel } from './edit-panel';
import styles from './generate-workspace.module.css';
import { DEFAULT_SHAPE, DEFAULT_STEPS, type GenerationModel, startingCount } from './generation-options';
import { type GenerationSettings, GenerationSettingsSheet } from './generation-settings-sheet';
import { HistoryPanel } from './history-panel';
import { type ReferenceImage, referenceImageFromUrl } from './reference-image';
import { type AiTemplate, resolveTemplateVariables, templateVariableDefaults } from './template-data';
import { TemplateGallery } from './template-gallery';
import { TemplateRunner } from './template-runner';

const TABS = [
  { value: 'create', label: 'Create' },
  { value: 'edit', label: 'Edit an image' },
  { value: 'templates', label: 'Templates' },
  { value: 'history', label: 'History' },
] as const;

export type GenerateTab = (typeof TABS)[number]['value'];

const DEFAULT_SETTINGS: GenerationSettings = { steps: DEFAULT_STEPS, seed: '', saveToFolderId: null };

interface GenerateWorkspaceProps {
  generationModels: GenerationModel[];
  editingModels: GenerationModel[];
  templates: AiTemplate[];
  initialTab: GenerateTab;
  /** An image handed over from elsewhere, seeded as the first Edit reference. */
  initialReference?: string;
  onInitialReferenceUsed: () => void;
}

/**
 * The Generate screen. One component owns the state for all four tabs, because
 * "Use in Edit" and "Reuse prompt" move work between them — switching tabs is a
 * change of view, never a reset.
 */
function GenerateWorkspace({
  generationModels,
  editingModels,
  templates,
  initialTab,
  initialReference,
  onInitialReferenceUsed,
}: GenerateWorkspaceProps) {
  const { folders } = useFolders();
  const [tab, setTab] = React.useState<GenerateTab>(initialTab);

  const [modelId, setModelId] = React.useState(generationModels[0]?.id ?? '');
  const [prompt, setPrompt] = React.useState('');
  const [shape, setShape] = React.useState<string>(DEFAULT_SHAPE);
  // Two by default: a pair to choose between is more use than a single image.
  const [count, setCount] = React.useState(2);
  const [settings, setSettings] = React.useState<GenerationSettings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const promptRef = React.useRef<HTMLTextAreaElement | null>(null);

  const [editPrompt, setEditPrompt] = React.useState('');
  const [editReferences, setEditReferences] = React.useState<ReferenceImage[]>([]);
  const [editCount, setEditCount] = React.useState(1);

  const [templateId, setTemplateId] = React.useState<string | null>(null);
  const [templateReferences, setTemplateReferences] = React.useState<ReferenceImage[]>([]);
  const [templateValues, setTemplateValues] = React.useState<Record<string, unknown>>({});
  const [templateCount, setTemplateCount] = React.useState(1);

  const model = generationModels.find((entry) => entry.id === modelId);
  const template = templates.find((entry) => entry.id === templateId) ?? null;
  const saveToFolderName = folders.find((folder) => folder.id === settings.saveToFolderId)?.name ?? null;

  const goToTab = React.useCallback((next: GenerateTab) => {
    startViewTransition(() => setTab(next), 'page');
  }, []);

  /** Adds an image as an Edit reference and lands on the tab that uses it. */
  const useInEdit = React.useCallback(
    (src: string) => {
      void (async () => {
        try {
          const reference = await referenceImageFromUrl(src, `use-in-edit-${Date.now()}`);
          setEditReferences((current) => [reference, ...current].slice(0, 4));
          goToTab('edit');
        } catch {
          toast.error('Could not load that image');
        }
      })();
    },
    [goToTab],
  );

  // An image handed over by another screen behaves exactly like "Use in Edit".
  const seededReference = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!initialReference || seededReference.current === initialReference) return;
    seededReference.current = initialReference;

    void (async () => {
      try {
        const reference = await referenceImageFromUrl(initialReference, `seed-${Date.now()}`);
        setEditReferences((current) => [reference, ...current].slice(0, 4));
      } catch {
        toast.error('Could not load that image');
      } finally {
        onInitialReferenceUsed();
      }
    })();
  }, [initialReference, onInitialReferenceUsed]);

  const reusePrompt = React.useCallback(
    (text: string) => {
      setPrompt(text);
      goToTab('create');
      // Focus after the transition has swapped the panel in.
      requestAnimationFrame(() => promptRef.current?.focus());
    },
    [goToTab],
  );

  const openTemplate = React.useCallback(
    (nextId: string | null) => {
      const next = nextId ? templates.find((entry) => entry.id === nextId) : null;
      startViewTransition(() => {
        setTemplateId(nextId);
        setTemplateReferences([]);
        setTemplateValues(next ? templateVariableDefaults(resolveTemplateVariables(next)) : {});
        setTemplateCount(next ? startingCount(next.minImageCount, next.maxImageCount) : 1);
      }, 'page');
    },
    [templates],
  );

  return (
    <div className={styles.root}>
      <div className={styles.head}>
        <Tabs
          value={tab}
          onValueChange={(value) => goToTab(value as GenerateTab)}
        >
          <TabsList>
            {TABS.map((entry) => (
              <TabsTrigger
                key={entry.value}
                value={entry.value}
              >
                {entry.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <span className={styles.status}>
          <i
            aria-hidden
            className={styles.dot}
          />
          {model ? `${model.label} is ready` : 'No model is available'}
        </span>
      </div>

      {tab === 'create' && (
        <CreatePanel
          models={generationModels}
          modelId={modelId}
          onModelChange={setModelId}
          prompt={prompt}
          onPromptChange={setPrompt}
          shape={shape}
          onShapeChange={setShape}
          count={count}
          onCountChange={setCount}
          settings={settings}
          onOpenSettings={() => setSettingsOpen(true)}
          onUseInEdit={useInEdit}
          saveToFolderName={saveToFolderName}
          promptRef={promptRef}
        />
      )}

      {tab === 'edit' && (
        <EditPanel
          models={editingModels}
          references={editReferences}
          onReferencesChange={setEditReferences}
          prompt={editPrompt}
          onPromptChange={setEditPrompt}
          count={editCount}
          onCountChange={setEditCount}
          onUseInEdit={useInEdit}
          saveToFolderId={settings.saveToFolderId}
        />
      )}

      {tab === 'templates' &&
        (template ? (
          <TemplateRunner
            template={template}
            onBack={() => openTemplate(null)}
            references={templateReferences}
            onReferencesChange={setTemplateReferences}
            values={templateValues}
            onValuesChange={setTemplateValues}
            count={templateCount}
            onCountChange={setTemplateCount}
            onUseInEdit={useInEdit}
          />
        ) : (
          <TemplateGallery
            templates={templates}
            onOpen={openTemplate}
          />
        ))}

      {tab === 'history' && <HistoryPanel onReuse={reusePrompt} />}

      <GenerationSettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onChange={setSettings}
        onReset={() => setSettings(DEFAULT_SETTINGS)}
      />
    </div>
  );
}

export { GenerateWorkspace };
