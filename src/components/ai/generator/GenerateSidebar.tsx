import { useCallback, useState } from 'react';
import { type EditingModelField, ModelFieldsForm } from '@/components/ai/editor/ModelFieldsForm';
import { PresetManager } from '@/components/ai/image/PresetManager';
import { AiRail } from '@/components/ai/shared/AiRail';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { GenerateParams } from '@/hooks/use-image-generation';
import { useModelFieldDefaults } from '@/hooks/use-model-field-defaults';
import styles from './GenerateSidebar.module.css';

interface GenerationModel {
  id: string;
  label: string;
  description: string | null;
  apiModelName: string;
  fields: EditingModelField[];
}

interface GenerateSidebarProps {
  generationModels: GenerationModel[];
  onGenerate: (params: GenerateParams) => Promise<unknown>;
}

export function GenerateSidebar({ generationModels, onGenerate }: GenerateSidebarProps) {
  const [selectedModelId, setSelectedModelId] = useState<string>(generationModels[0]?.id || '');
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({});

  const selectedModel = generationModels.find((m) => m.id === selectedModelId);

  // Initialize field values with defaults when model changes
  useModelFieldDefaults(selectedModel?.fields, setFieldValues);

  const handleModelChange = (modelId: string | null) => {
    if (modelId) {
      setSelectedModelId(modelId);
    }
  };

  const handleLoadPreset = useCallback((presetFieldValues: Record<string, unknown>) => {
    setFieldValues(presetFieldValues);
  }, []);

  // Get prompt value from field values
  const promptValue = (fieldValues.prompt as string) || '';

  const handleGenerate = useCallback(
    (nextFieldValues = fieldValues) => {
      const nextPrompt = (nextFieldValues.prompt as string) || '';
      if (!selectedModel || !nextPrompt.trim()) return;

      // Fire-and-forget: add to queue and let it process in background
      void onGenerate({
        modelId: selectedModelId,
        modelLabel: selectedModel.label,
        fieldValues: nextFieldValues,
        prompt: nextPrompt,
      });
    },
    [fieldValues, onGenerate, selectedModel, selectedModelId],
  );

  const handleSubmitShortcut = useCallback(
    (name: string, value: unknown) => {
      const nextFieldValues = { ...fieldValues, [name]: value };
      setFieldValues(nextFieldValues);
      handleGenerate(nextFieldValues);
    },
    [fieldValues, handleGenerate],
  );

  const isGenerateDisabled = !promptValue.trim() || !selectedModelId;

  return (
    <AiRail
      title="Generate Settings"
      footer={
        <>
          <Button
            onClick={() => handleGenerate()}
            disabled={isGenerateDisabled}
            className={styles.generateButton}
            size="lg"
          >
            Generate
          </Button>
          {isGenerateDisabled && (
            <p className={styles.generateHint}>{!promptValue.trim() ? 'Enter a prompt to generate' : 'Select a model to continue'}</p>
          )}
        </>
      }
    >
      {/* Model Selection */}
      <div className="stack space-2">
        <Label className={styles.sectionLabel}>Generation Model</Label>
        <Select
          value={selectedModelId}
          onValueChange={handleModelChange}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a model">{selectedModel?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {generationModels.map((model) => (
              <SelectItem
                key={model.id}
                value={model.id}
              >
                <div className={styles.modelOption}>
                  <span className={styles.modelLabel}>{model.label}</span>
                  {model.description && <span className={styles.modelDescription}>{model.description}</span>}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Presets */}
      {selectedModelId && (
        <PresetManager
          modelId={selectedModelId}
          currentFieldValues={fieldValues}
          onLoadPreset={handleLoadPreset}
        />
      )}

      {/* Dynamic Model Fields */}
      {selectedModel && selectedModel.fields.length > 0 && (
        <div className="stack space-3">
          <Label className={styles.sectionLabel}>Model Parameters</Label>
          <ModelFieldsForm
            fields={selectedModel.fields}
            values={fieldValues}
            onChange={setFieldValues}
            onSubmitShortcut={handleSubmitShortcut}
          />
        </div>
      )}
    </AiRail>
  );
}
