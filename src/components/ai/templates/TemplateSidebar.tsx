import { ImageIcon, LayoutTemplate, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ReferenceImageSection } from '@/components/ai/editor/ReferenceImageSection';
import type { ImageItem } from '@/components/ai/editor/SortableImageCard';
import { AiRail } from '@/components/ai/shared/AiRail';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { useModelFieldDefaults } from '@/hooks/use-model-field-defaults';
import type { TemplateGenerateParams } from '@/hooks/use-template-stream-generation';
import { getTemplateImageUrl } from '@/libs/utils';
import { type Template, TemplatePickerDialog } from './TemplatePickerDialog';
import { type TemplateVariable, TemplateVariableSection } from './TemplateVariableSection';

interface TemplateSidebarProps {
  onGenerate: (params: TemplateGenerateParams) => Promise<unknown>;
}

export function TemplateSidebar({ onGenerate }: TemplateSidebarProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [imageCount, setImageCount] = useState(1);
  const [variableValues, setVariableValues] = useState<Record<string, unknown>>({});

  // Process template variables (inline + global)
  const getProcessedVariables = useCallback((template: Template | null): TemplateVariable[] => {
    if (!template) return [];

    const variables: TemplateVariable[] = [];

    // Add inline variables
    const inlineVars = Array.isArray(template.variables) ? template.variables : [];
    for (const v of inlineVars as TemplateVariable[]) {
      variables.push(v);
    }

    // Add global variables
    if (template.globalVariables) {
      for (const tgv of template.globalVariables) {
        const gv = tgv.globalVariable;
        const addedOptions = (tgv.addedOptions as any[]) || [];
        const options = gv.options ? JSON.parse(JSON.stringify(gv.options)) : [];
        if (addedOptions.length > 0) {
          options.push(...addedOptions);
        }

        variables.push({
          id: `global-${gv.id}`,
          name: gv.name,
          label: gv.label,
          type: gv.type as 'text' | 'number' | 'dropdown' | 'boolean',
          required: tgv.required ?? gv.required,
          options,
          defaultValue: gv.defaultValue,
          description: gv.description,
        });
      }
    }

    return variables;
  }, []);

  const processedVariables = useMemo(() => getProcessedVariables(selectedTemplate), [selectedTemplate, getProcessedVariables]);

  // Initialize variable values with defaults when template changes
  useModelFieldDefaults(processedVariables, setVariableValues);

  useEffect(() => {
    setImageCount(selectedTemplate?.minImageCount || 1);
  }, [selectedTemplate]);

  const handleTemplateSelect = (template: Template) => {
    setSelectedTemplate(template);
    setImages([]);
  };

  const handleVariableChange = (name: string, value: unknown) => {
    setVariableValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleGenerate = () => {
    if (!selectedTemplate || images.length < selectedTemplate.inputImageCount) return;

    void onGenerate({
      template: { id: selectedTemplate.id, name: selectedTemplate.name },
      images,
      variableValues,
      imageCount,
    });
  };

  // Get preview image for selected template
  const getPreviewImage = (): string | null => {
    if (!selectedTemplate?.previewImages) return null;
    try {
      const rawImages = JSON.parse(selectedTemplate.previewImages);
      if (rawImages.length > 0) {
        return getTemplateImageUrl(rawImages[0]);
      }
    } catch {
      // ignore
    }
    return null;
  };

  // Validation
  const requiredVariables = processedVariables.filter((v) => v.required);
  const allRequiredFilled = requiredVariables.every((v) => {
    const val = variableValues[v.name];
    return val !== undefined && val !== '' && val !== '__NOTHING__';
  });
  const hasEnoughImages = !selectedTemplate || images.length >= selectedTemplate.inputImageCount;
  const isGenerateDisabled = !selectedTemplate || !hasEnoughImages || !allRequiredFilled;

  const getDisabledReason = () => {
    if (!selectedTemplate) return 'Select a template to continue';
    if (!hasEnoughImages) {
      const needed = selectedTemplate.inputImageCount - images.length;
      return `Upload ${needed} more image${needed !== 1 ? 's' : ''}`;
    }
    if (!allRequiredFilled) {
      const missing = requiredVariables.filter((v) => {
        const val = variableValues[v.name];
        return val === undefined || val === '' || val === '__NOTHING__';
      }).length;
      return `Fill ${missing} required field${missing !== 1 ? 's' : ''}`;
    }
    return null;
  };

  return (
    <>
      <AiRail
        title="Template Generation"
        footer={
          <>
            <Button
              onClick={handleGenerate}
              disabled={isGenerateDisabled}
              className="w-full"
              size="lg"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Generate {imageCount > 1 ? `(${imageCount} images)` : ''}
            </Button>
            {isGenerateDisabled && <p className="text-xs text-muted-foreground text-center mt-2">{getDisabledReason()}</p>}
          </>
        }
      >
        {/* Template Selection */}
        <div className="space-y-3">
          {selectedTemplate ? (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
              <div className="flex gap-3">
                {/* Preview Thumbnail */}
                <div className="w-16 h-16 rounded-md overflow-hidden bg-muted shrink-0">
                  {getPreviewImage() ? (
                    <img
                      src={getPreviewImage()!}
                      alt={selectedTemplate.name}
                      loading="lazy"
                      className="object-cover w-full h-full"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="w-6 h-6 text-muted-foreground" />
                    </div>
                  )}
                </div>
                {/* Template Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm truncate">{selectedTemplate.name}</h3>
                  {selectedTemplate.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{selectedTemplate.description}</p>
                  )}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setIsPickerOpen(true)}
              >
                <LayoutTemplate className="w-4 h-4 mr-2" />
                Change Template
              </Button>
            </div>
          ) : (
            <div
              className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => setIsPickerOpen(true)}
            >
              <LayoutTemplate className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm font-medium">Select a Template</p>
              <p className="text-xs text-muted-foreground mt-1">Click to browse available templates</p>
            </div>
          )}
        </div>

        {/* Reference Images (only if template requires images) */}
        {selectedTemplate && selectedTemplate.inputImageCount > 0 && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              Reference Images
              <span className="text-muted-foreground ml-1">({selectedTemplate.inputImageCount} required)</span>
            </Label>
            <ReferenceImageSection
              images={images}
              onImagesChange={setImages}
              maxImages={selectedTemplate.inputImageCount}
              purpose="template-edit"
            />
          </div>
        )}

        {/* Image Count Slider - only show if there's a range to choose from */}
        {selectedTemplate && (selectedTemplate.maxImageCount || 4) > (selectedTemplate.minImageCount || 1) && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Images to Generate</Label>
              <span className="text-sm font-semibold tabular-nums">{imageCount}</span>
            </div>
            <Slider
              value={[imageCount]}
              onValueChange={(value) => setImageCount(Array.isArray(value) ? value[0]! : value)}
              min={selectedTemplate.minImageCount || 1}
              max={selectedTemplate.maxImageCount || 4}
              step={1}
            />
          </div>
        )}

        {/* Template Variables */}
        {selectedTemplate && processedVariables.length > 0 && (
          <TemplateVariableSection
            variables={processedVariables}
            values={variableValues}
            onChange={handleVariableChange}
          />
        )}
      </AiRail>

      <TemplatePickerDialog
        isOpen={isPickerOpen}
        onOpenChange={setIsPickerOpen}
        onTemplateSelect={handleTemplateSelect}
        selectedTemplateId={selectedTemplate?.id}
      />
    </>
  );
}
