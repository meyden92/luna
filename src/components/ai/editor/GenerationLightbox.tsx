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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8">
          {/* Close button */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 z-50 bg-background/80 backdrop-blur-sm"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-5 w-5" />
          </Button>

          {/* Main content */}
          <div className="flex flex-col w-full max-w-6xl max-h-[90vh] bg-background rounded-lg overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-4">
                <h2 className="text-lg font-semibold">{generation.modelLabel}</h2>
                {successfulResults.length > 1 && (
                  <Select
                    value={selectedOutputIndex.toString()}
                    onValueChange={(value) => setSelectedOutput({ generationId, index: Number(value) })}
                  >
                    <SelectTrigger className="w-[150px]">
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
              </div>
            </div>

            {/* Comparison area */}
            <div className="flex-1 min-h-0 p-4">
              <Comparison className="w-full h-full rounded-lg aspect-video">
                <ComparisonItem position="left">
                  <img
                    src={resultImageUrl}
                    alt="Generated result"
                    className="absolute inset-0 h-full w-full object-contain"
                    sizes="(max-width: 1200px) 100vw, 1200px"
                  />
                </ComparisonItem>
                <ComparisonItem position="right">
                  {currentReferenceImage && (
                    <img
                      src={currentReferenceImage}
                      alt="Reference image"
                      className="absolute inset-0 h-full w-full object-contain"
                      sizes="(max-width: 1200px) 100vw, 1200px"
                    />
                  )}
                </ComparisonItem>
                <ComparisonHandle />
              </Comparison>
            </div>

            {/* Footer with labels */}
            <div className="flex items-center justify-between p-4 border-t text-sm text-muted-foreground">
              <span>Generated Result{successfulResults.length > 1 ? ` ${selectedOutputIndex + 1}/${successfulResults.length}` : ''}</span>
              <span className="flex items-center gap-1">
                <ChevronDown className="h-4 w-4 rotate-90" />
                Drag to compare
                <ChevronDown className="h-4 w-4 -rotate-90" />
              </span>
              <span>Reference {selectedReferenceIndex + 1}</span>
            </div>
          </div>
        </div>
      </DialogPortal>
    </Dialog>
  );
}
