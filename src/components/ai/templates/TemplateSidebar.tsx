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
import styles from './TemplateSidebar.module.css';
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
              className={styles.generateButton}
              size="lg"
            >
              <Sparkles className={styles.generateIcon} />
              Generate {imageCount > 1 ? `(${imageCount} images)` : ''}
            </Button>
            {isGenerateDisabled && <p className={styles.disabledHint}>{getDisabledReason()}</p>}
          </>
        }
      >
        {/* Template Selection */}
        <div>
          {selectedTemplate ? (
            <div className={styles.selected}>
              <div className={styles.selectedRow}>
                {/* Preview Thumbnail */}
                <div className={styles.thumb}>
                  {getPreviewImage() ? (
                    <img
                      src={getPreviewImage()!}
                      alt={selectedTemplate.name}
                      loading="lazy"
                      className={styles.thumbImage}
                    />
                  ) : (
                    <ImageIcon className={styles.thumbIcon} />
                  )}
                </div>
                {/* Template Info */}
                <div className={styles.info}>
                  <h3 className={styles.name}>{selectedTemplate.name}</h3>
                  {selectedTemplate.description && <p className={styles.description}>{selectedTemplate.description}</p>}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className={styles.changeButton}
                onClick={() => setIsPickerOpen(true)}
              >
                <LayoutTemplate className={styles.changeIcon} />
                Change Template
              </Button>
            </div>
          ) : (
            <div
              className={styles.empty}
              onClick={() => setIsPickerOpen(true)}
            >
              <LayoutTemplate className={styles.emptyIcon} />
              <p className={styles.emptyTitle}>Select a Template</p>
              <p className={styles.emptyHint}>Click to browse available templates</p>
            </div>
          )}
        </div>

        {/* Reference Images (only if template requires images) */}
        {selectedTemplate && selectedTemplate.inputImageCount > 0 && (
          <div className="stack space-2">
            <Label>
              Reference Images
              <span className={styles.required}>({selectedTemplate.inputImageCount} required)</span>
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
          <div className="stack space-3">
            <div className={styles.sliderRow}>
              <Label>Images to Generate</Label>
              <span className={styles.sliderValue}>{imageCount}</span>
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
