import { useNavigate } from '@tanstack/react-router';
import { ChevronDown, ImagePlus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { generationDownloadFilename } from '@/components/ai/shared/GenerationCard';
import { Button } from '@/components/ui/button';
import DownloadButton from '@/components/ui/DownloadButton';
import { Dialog, DialogOverlay, DialogPortal } from '@/components/ui/dialog';
import { Comparison, ComparisonHandle, ComparisonItem } from '@/components/ui/image-compare';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { TemplateGenerationItem } from '@/hooks/stores/template-generation-queue-store';
import styles from './TemplateGenerationLightbox.module.css';

interface TemplateGenerationLightboxProps {
  generation: TemplateGenerationItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TemplateGenerationLightbox({ generation, open, onOpenChange }: TemplateGenerationLightboxProps) {
  const [selectedReferenceIndex, setSelectedReferenceIndex] = useState(0);
  const navigate = useNavigate();

  // Get reference images from the result's originalImageUrls, fallback to inputPreviews
  const referenceImages = useMemo(() => {
    if (!generation) return [];

    // Prefer the cached CDN URLs from result.originalImageUrls
    const originalUrls = generation.result?.originalImageUrls;
    if (originalUrls && originalUrls.length > 0) {
      return originalUrls;
    }

    // Fallback to inputPreviews (may be blob URLs)
    return generation.inputPreviews.filter(Boolean);
  }, [generation]);

  // Get the generated result image URL
  const resultImageUrl = generation?.result?.resultImageUrl || null;

  // Reset selected index when generation changes
  const currentReferenceImage = referenceImages[selectedReferenceIndex] || referenceImages[0];

  // Generate filename for download
  const downloadFilename = useMemo(() => {
    if (!generation) return 'generated-image.png';
    return generationDownloadFilename(generation.templateName, generation.createdAt, generation.batchIndex);
  }, [generation]);

  const handleSendToEdit = () => {
    if (!resultImageUrl) return;
    void navigate({ to: '/ai/edit', search: { ref: resultImageUrl } });
    onOpenChange(false);
  };

  if (!generation || !resultImageUrl) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogPortal>
        <DialogOverlay />
        <div className={styles.root}>
          {/* Header bar */}
          <div className={`${styles.bar} ${styles.barTop}`}>
            <div className={styles.barGroup}>
              <h2 className={styles.templateName}>{generation.templateName}</h2>
              {referenceImages.length > 1 && (
                <Select
                  value={selectedReferenceIndex.toString()}
                  onValueChange={(value) => setSelectedReferenceIndex(Number(value))}
                >
                  <SelectTrigger className={styles.referenceSelect}>
                    <SelectValue placeholder="Reference image" />
                  </SelectTrigger>
                  <SelectContent>
                    {referenceImages.map((url, index) => (
                      <SelectItem
                        key={url}
                        value={index.toString()}
                      >
                        Reference {index + 1}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className={styles.barActions}>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSendToEdit}
                className="space-2"
              >
                <ImagePlus />
                Edit
              </Button>
              <DownloadButton
                url={resultImageUrl}
                filename={downloadFilename}
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
              >
                <X />
              </Button>
            </div>
          </div>

          {/* Comparison area - fills remaining space */}
          <div className={styles.stage}>
            <Comparison className={styles.comparison}>
              <ComparisonItem position="left">
                <img
                  src={resultImageUrl}
                  alt="Generated result"
                  className={styles.comparisonImage}
                  sizes="95vw"
                />
              </ComparisonItem>
              <ComparisonItem position="right">
                {currentReferenceImage && (
                  <img
                    src={currentReferenceImage}
                    alt="Reference image"
                    className={styles.comparisonImage}
                    sizes="95vw"
                  />
                )}
              </ComparisonItem>
              <ComparisonHandle />
            </Comparison>
          </div>

          {/* Footer with labels */}
          <div className={`${styles.bar} ${styles.barBottom}`}>
            <span>Generated Result</span>
            <span className={styles.hint}>
              <ChevronDown className={styles.hintIconStart} />
              Drag to compare
              <ChevronDown className={styles.hintIconEnd} />
            </span>
            <span>Reference {selectedReferenceIndex + 1}</span>
          </div>
        </div>
      </DialogPortal>
    </Dialog>
  );
}
