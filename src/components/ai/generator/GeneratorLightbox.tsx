import { useNavigate } from '@tanstack/react-router';
import { Check, Copy, ImagePlus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { generationDownloadFilename } from '@/components/ai/shared/GenerationCard';
import { Button } from '@/components/ui/button';
import DownloadButton from '@/components/ui/DownloadButton';
import { Dialog, DialogOverlay, DialogPortal } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { GenerationQueueItem } from '@/hooks/stores/image-generation-queue-store';
import { cn } from '@/libs/utils';

interface GeneratorLightboxProps {
  generation: GenerationQueueItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GeneratorLightbox({ generation, open, onOpenChange }: GeneratorLightboxProps) {
  const [copied, setCopied] = useState(false);
  const [selectedOutput, setSelectedOutput] = useState({ generationId: '', index: 0 });
  const navigate = useNavigate();
  const generationId = generation?.id ?? '';
  const selectedOutputIndex = selectedOutput.generationId === generationId ? selectedOutput.index : 0;

  const successfulResults = useMemo(() => {
    return generation?.result?.results.filter((r) => r.success && r.resultImageUrl) ?? [];
  }, [generation]);

  const selectedResult = successfulResults[selectedOutputIndex] || successfulResults[0];
  const resultImageUrl = selectedResult?.resultImageUrl || null;

  // Generate filename for download
  const downloadFilename = useMemo(() => {
    if (!generation) return 'generated-image.png';
    const batchIndex = typeof selectedResult?.index === 'number' ? Math.max(selectedResult.index - 1, 0) : undefined;
    return generationDownloadFilename(generation.modelLabel, generation.createdAt, batchIndex);
  }, [generation, selectedResult?.index]);

  // Pretty-print the prompt when it is JSON, otherwise show it verbatim
  const prompt = useMemo(() => {
    const raw = generation?.prompt ?? '';
    try {
      return { text: JSON.stringify(JSON.parse(raw), null, 2), isJson: true };
    } catch {
      return { text: raw, isJson: false };
    }
  }, [generation?.prompt]);

  const handleCopy = () => {
    void navigator.clipboard.writeText(prompt.text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

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
        {/* Backdrop layer — click outside the panel to close */}
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-8"
          onClick={() => onOpenChange(false)}
        >
          <div
            className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-background shadow-2xl ring-1 ring-border md:h-[82vh] md:max-h-[82vh] md:flex-row"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-3 right-3 z-10 rounded-full bg-background/70 text-foreground backdrop-blur-sm hover:bg-background"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-5 w-5" />
              <span className="sr-only">Close</span>
            </Button>

            {/* Image stage */}
            <div className="flex h-[42vh] shrink-0 items-center justify-center bg-neutral-950 p-4 md:h-auto md:min-h-0 md:flex-1 md:p-6">
              <img
                src={resultImageUrl}
                alt="Generated result"
                className="max-h-full max-w-full rounded-lg object-contain shadow-lg"
              />
            </div>

            {/* Details panel */}
            <div className="flex min-h-0 w-full flex-1 flex-col border-t md:w-[360px] md:flex-none md:border-t-0 md:border-l">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Model</p>
                  <h2 className="truncate text-base font-semibold leading-tight">{generation.modelLabel}</h2>
                  {successfulResults.length > 1 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Output {selectedOutputIndex + 1} of {successfulResults.length}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {successfulResults.length > 1 && (
                    <Select
                      value={selectedOutputIndex.toString()}
                      onValueChange={(value) => setSelectedOutput({ generationId, index: Number(value) })}
                    >
                      <SelectTrigger className="h-9 w-[118px]">
                        <SelectValue placeholder="Output" />
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
                    className="shrink-0"
                  />
                </div>
              </div>

              {/* Prompt */}
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex items-center justify-between px-5 pb-2 pt-4">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Prompt{prompt.isJson ? ' · JSON' : ''}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors',
                      copied ? 'text-emerald-600' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-auto px-5 pb-5">
                  <pre className="whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-3 font-mono text-xs leading-relaxed text-foreground/90">
                    {prompt.text}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogPortal>
    </Dialog>
  );
}
