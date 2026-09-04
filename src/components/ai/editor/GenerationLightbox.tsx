import { useNavigate } from '@tanstack/react-router';
import { ChevronDown, ImagePlus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { generationDownloadFilename } from '@/components/ai/shared/GenerationCard';
import { Button } from '@/components/ui/button';
import DownloadButton from '@/components/ui/DownloadButton';
import { Dialog, DialogOverlay, DialogPortal } from '@/components/ui/dialog';
import { Comparison, ComparisonHandle, ComparisonItem } from '@/components/ui/image-compare';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { GenerationItem } from '@/hooks/stores/image-editor-queue-store';
import styles from './GenerationLightbox.module.css';

interface GenerationLightboxProps {
  generation: GenerationItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GenerationLightbox({ generation, open, onOpenChange }: GenerationLightboxProps) {
  const [selectedReference, setSelectedReference] = useState({ generationId: '', index: 0 });
  const [selectedOutput, setSelectedOutput] = useState({ generationId: '', index: 0 });
  const navigate = useNavigate();
  const generationId = generation?.id ?? '';
  const selectedReferenceIndex = selectedReference.generationId === generationId ? selectedReference.index : 0;
  const selectedOutputIndex = selectedOutput.generationId === generationId ? selectedOutput.index : 0;

  // Get reference images from the cached URLs in result, fallback to inputPreviews
  const referenceImages = useMemo(() => {
    if (!generation) return [];

    // Prefer the cached CDN URLs from result.originalImageUrl
    const originalUrls = generation.result?.originalImageUrl;
    if (originalUrls) {
      return Array.isArray(originalUrls) ? originalUrls : [originalUrls];
    }

    // Fallback to inputPreviews (may be blob URLs)
    return generation.inputPreviews.filter(Boolean);
  }, [generation]);

  const successfulResults = useMemo(() => {
    return generation?.result?.results.filter((r) => r.success && r.resultImageUrl) ?? [];
  }, [generation]);

  const selectedResult = successfulResults[selectedOutputIndex] || successfulResults[0];
  const resultImageUrl = selectedResult?.resultImageUrl || null;
  const currentReferenceImage = referenceImages[selectedReferenceIndex] || referenceImages[0];

  // Generate filename for download
  const downloadFilename = useMemo(() => {
    if (!generation) return 'generated-image.png';
    const batchIndex = typeof selectedResult?.index === 'number' ? Math.max(selectedResult.index - 1, 0) : undefined;
    return generationDownloadFilename(generation.modelLabel, generation.createdAt, batchIndex);
  }, [generation, selectedResult?.index]);

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
        <div className={styles.layer}>
          {/* Close button */}
          <Button
            variant="ghost"
            size="icon"
            className={styles.closeButton}
            onClick={() => onOpenChange(false)}
          >
            <X className={styles.closeIcon} />
          </Button>

          {/* Main content */}
          <div className={styles.panel}>
            {/* Header */}
            <div className={styles.header}>
              <div className={styles.headerMeta}>
                <h2 className={styles.title}>{generation.modelLabel}</h2>
                {successfulResults.length > 1 && (
                  <Select
                    value={selectedOutputIndex.toString()}
                    onValueChange={(value) => setSelectedOutput({ generationId, index: Number(value) })}
                  >
                    <SelectTrigger className={styles.outputSelect}>
                      <SelectValue placeholder="Generated output" />
                    </SelectTrigger>
                    <SelectContent>
                      {successfulResults.map((result, index) => (
                        <SelectItem
                          key={`${result.index}-${result.resultImageUrl}`}
                          value={index.toString()}
                        >
                          Output {index + 1}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {referenceImages.length > 1 && (
                  <Select
                    value={selectedReferenceIndex.toString()}
                    onValueChange={(value) => setSelectedReference({ generationId, index: Number(value) })}
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
              <div className={styles.headerActions}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSendToEdit}
                  className={styles.editButton}
                >
                  <ImagePlus className={styles.icon} />
                  Edit
                </Button>
                <DownloadButton
                  url={resultImageUrl}
                  filename={downloadFilename}
                />
              </div>
            </div>

            {/* Comparison area */}
            <div className={styles.comparisonArea}>
              <Comparison className={styles.comparison}>
                <ComparisonItem position="left">
                  <img
                    src={resultImageUrl}
                    alt="Generated result"
                    className={styles.comparisonImage}
                    sizes="(max-width: 1200px) 100vw, 1200px"
                  />
                </ComparisonItem>
                <ComparisonItem position="right">
                  {currentReferenceImage && (
                    <img
                      src={currentReferenceImage}
                      alt="Reference image"
                      className={styles.comparisonImage}
                      sizes="(max-width: 1200px) 100vw, 1200px"
                    />
                  )}
                </ComparisonItem>
                <ComparisonHandle />
              </Comparison>
            </div>

            {/* Footer with labels */}
            <div className={styles.footer}>
              <span>Generated Result{successfulResults.length > 1 ? ` ${selectedOutputIndex + 1}/${successfulResults.length}` : ''}</span>
              <span className={styles.hint}>
                <ChevronDown className={styles.hintIconStart} />
                Drag to compare
                <ChevronDown className={styles.hintIconEnd} />
              </span>
              <span>Reference {selectedReferenceIndex + 1}</span>
            </div>
          </div>
        </div>
      </DialogPortal>
    </Dialog>
  );
}
