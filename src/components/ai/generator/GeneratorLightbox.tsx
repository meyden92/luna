import { useNavigate } from '@tanstack/react-router';
import { Check, Copy, ImagePlus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { generationDownloadFilename } from '@/components/ai/shared/GenerationCard';
import { Button } from '@/components/ui/button';
import DownloadButton from '@/components/ui/DownloadButton';
import { Dialog, DialogOverlay, DialogPortal } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { GenerationQueueItem } from '@/hooks/stores/image-generation-queue-store';
import styles from './GeneratorLightbox.module.css';

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
          className={styles.backdrop}
          onClick={() => onOpenChange(false)}
        >
          <div
            className={styles.panel}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <Button
              variant="ghost"
              size="icon"
              className={styles.close}
              onClick={() => onOpenChange(false)}
            >
              <X />
              <span className="sr-only">Close</span>
            </Button>

            {/* Image stage */}
            <div className={styles.stage}>
              <img
                src={resultImageUrl}
                alt="Generated result"
                className={styles.stageImage}
              />
            </div>

            {/* Details panel */}
            <div className={styles.details}>
              {/* Header */}
              <div className={styles.detailsHeader}>
                <div className={styles.headerText}>
                  <p className={styles.eyebrow}>Model</p>
                  <h2 className={styles.modelLabel}>{generation.modelLabel}</h2>
                  {successfulResults.length > 1 && (
                    <p className={styles.outputCount}>
                      Output {selectedOutputIndex + 1} of {successfulResults.length}
                    </p>
                  )}
                </div>
                <div className={styles.headerActions}>
                  {successfulResults.length > 1 && (
                    <Select
                      value={selectedOutputIndex.toString()}
                      onValueChange={(value) => setSelectedOutput({ generationId, index: Number(value) })}
                    >
                      <SelectTrigger className={styles.outputSelect}>
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
                    className="space-2"
                  >
                    <ImagePlus />
                    Edit
                  </Button>
                  <DownloadButton
                    url={resultImageUrl}
                    filename={downloadFilename}
                  />
                </div>
              </div>

              {/* Prompt */}
              <div className={styles.prompt}>
                <div className={styles.promptHeader}>
                  <span className={styles.eyebrow}>Prompt{prompt.isJson ? ' · JSON' : ''}</span>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className={styles.copy}
                    data-copied={copied ? '' : undefined}
                  >
                    {copied ? <Check className={styles.copyIcon} /> : <Copy className={styles.copyIcon} />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <div className={styles.promptBody}>
                  <pre className={styles.promptText}>{prompt.text}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogPortal>
    </Dialog>
  );
}
