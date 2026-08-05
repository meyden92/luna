import { useCallback, useState } from 'react';
import { PresetManager } from '@/components/ai/image/PresetManager';
import { AiRail } from '@/components/ai/shared/AiRail';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { EditGenerateParams } from '@/hooks/use-edit-image-generation';
import { useModelFieldDefaults } from '@/hooks/use-model-field-defaults';
import { type EditingModelField, ModelFieldsForm } from './ModelFieldsForm';
import { ReferenceImageSection } from './ReferenceImageSection';
import type { ImageItem } from './SortableImageCard';

interface EditingModel {
  id: string;
  label: string;
  description: string | null;
  apiModelName: string;
  fields: EditingModelField[];
}

interface EditSidebarProps {
  editingModels: EditingModel[];
  onGenerate: (params: EditGenerateParams) => Promise<unknown>;
  referenceImageUrl?: string;
  onReferenceImageSeeded?: () => void;
}

export function EditSidebar({ editingModels, onGenerate, referenceImageUrl, onReferenceImageSeeded }: EditSidebarProps) {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>(editingModels[0]?.id || '');
  const [fieldValues, setFieldValues] = useState<Record<string, any>>({});

  const selectedModel = editingModels.find((m) => m.id === selectedModelId);

  // Initialize field values with defaults when model changes
  useModelFieldDefaults(selectedModel?.fields, setFieldValues);

  const handleModelChange = (modelId: string | null) => {
    if (modelId) {
      setSelectedModelId(modelId);
    }
  };

  const handleLoadPreset = useCallback((presetFieldValues: Record<string, any>) => {
    setFieldValues(presetFieldValues);
  }, []);

  const handleGenerate = useCallback(() => {
    if (!selectedModel || images.length === 0) return;

    // Fire-and-forget: add to queue and let it process in background
    void onGenerate({
      images,
      modelId: selectedModelId,
      modelLabel: selectedModel.label,
      fieldValues,
      imageCount: 1,
    });
  }, [fieldValues, images, onGenerate, selectedModel, selectedModelId]);

  const isGenerateDisabled = images.length === 0 || !selectedModelId;

  return (
    <AiRail
      title="Edit Settings"
      footer={
        <>
          <Button
            onClick={handleGenerate}
            disabled={isGenerateDisabled}
            className="w-full"
            size="lg"
          >
            Generate
          </Button>
          {isGenerateDisabled && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              {images.length === 0 ? 'Upload at least one reference image' : 'Select a model to continue'}
            </p>
          )}
        </>
      }
    >
      {/* Reference Images */}
      <ReferenceImageSection
        images={images}
        onImagesChange={setImages}
        purpose="image-edit"
        initialImageUrl={referenceImageUrl}
        onInitialImageLoaded={onReferenceImageSeeded}
      />

      {/* Model Selection */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Editing Model</Label>
        <Select
          value={selectedModelId}
          onValueChange={handleModelChange}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a model">{selectedModel?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {editingModels.map((model) => (
              <SelectItem
                key={model.id}
                value={model.id}
              >
                <div className="flex flex-col items-start">
                  <span className="font-medium">{model.label}</span>
                  {model.description && <span className="text-xs text-muted-foreground">{model.description}</span>}
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
        <div className="space-y-3">
          <Label className="text-sm font-medium">Model Parameters</Label>
          <ModelFieldsForm
            fields={selectedModel.fields}
            values={fieldValues}
            onChange={setFieldValues}
          />
        </div>
      )}
    </AiRail>
  );
}
