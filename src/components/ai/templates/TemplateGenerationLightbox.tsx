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
        <div className="fixed inset-0 z-50 flex flex-col">
          {/* Header bar */}
          <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-background/95 backdrop-blur-sm border-b">
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-semibold">{generation.templateName}</h2>
              {referenceImages.length > 1 && (
                <Select
                  value={selectedReferenceIndex.toString()}
                  onValueChange={(value) => setSelectedReferenceIndex(Number(value))}
                >
                  <SelectTrigger className="w-[180px]">
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
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSendToEdit}
                className="gap-1.5"
              >
                <ImagePlus className="h-3.5 w-3.5" />
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
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Comparison area - fills remaining space */}
          <div className="flex-1 min-h-0 flex items-center justify-center p-4 bg-black/50">
            <Comparison className="w-full h-full max-w-[95vw] max-h-[calc(100vh-8rem)]">
              <ComparisonItem position="left">
                <img
                  src={resultImageUrl}
                  alt="Generated result"
                  className="absolute inset-0 h-full w-full object-contain"
                  sizes="95vw"
                />
              </ComparisonItem>
              <ComparisonItem position="right">
                {currentReferenceImage && (
                  <img
                    src={currentReferenceImage}
                    alt="Reference image"
                    className="absolute inset-0 h-full w-full object-contain"
                    sizes="95vw"
                  />
                )}
              </ComparisonItem>
              <ComparisonHandle />
            </Comparison>
          </div>

          {/* Footer with labels */}
          <div className="shrink-0 flex items-center justify-between px-4 py-2 bg-background/95 backdrop-blur-sm border-t text-sm text-muted-foreground">
            <span>Generated Result</span>
            <span className="flex items-center gap-1">
              <ChevronDown className="h-4 w-4 rotate-90" />
              Drag to compare
              <ChevronDown className="h-4 w-4 -rotate-90" />
            </span>
            <span>Reference {selectedReferenceIndex + 1}</span>
          </div>
        </div>
      </DialogPortal>
    </Dialog>
  );
}
