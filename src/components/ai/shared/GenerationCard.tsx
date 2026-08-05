import { formatDistanceToNow } from 'date-fns';
import { AlertCircle, CircleStop, Download, RotateCcw, Trash2 } from 'lucide-react';
import { type ReactNode, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { GenerationStatus } from '@/hooks/stores/image-editor-queue-store';
import { downloadImage } from '@/libs/download';
import { cn } from '@/libs/utils';
import { GenerationStatusBadge } from './GenerationStatusBadge';

export interface GenerationCardItem {
  id: string;
  status: GenerationStatus;
  progress: number;
  statusMessage?: string;
  createdAt: number;
  error?: string;
}

export interface GenerationCardContent {
  /** Footer label (model or template name) */
  label: string;
  resultImageUrl: string | null;
  resultImageUrls?: string[];
  downloadFilename: string;
  /** Image shown while processing/failed (e.g. input preview) */
  fallbackImage?: string;
  /** Rendered when there is no image to display */
  placeholder?: ReactNode;
}

export function generationDownloadFilename(label: string, createdAt: number, batchIndex?: number) {
  const timestamp = new Date(createdAt).toISOString().slice(0, 10);
  const slug = label.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  return batchIndex === undefined ? `${slug}-${timestamp}.png` : `${slug}-${batchIndex + 1}-${timestamp}.png`;
}

interface GenerationCardProps<TItem extends GenerationCardItem> {
  generation: TItem;
  content: GenerationCardContent;
  onRemove?: (id: string) => void;
  onRetry?: (generation: TItem) => void;
  onCancel?: (generation: TItem) => void;
  onClick?: (generation: TItem) => void;
  isSelected?: boolean;
}

export function GenerationCard<TItem extends GenerationCardItem>({
  generation,
  content,
  onRemove,
  onRetry,
  onCancel,
  onClick,
  isSelected,
}: GenerationCardProps<TItem>) {
  const { id, status, progress, statusMessage, createdAt, error } = generation;
  const { label, resultImageUrl, resultImageUrls, downloadFilename, fallbackImage, placeholder } = content;

  const isProcessing = status === 'queued' || status === 'uploading' || status === 'processing';
  const isComplete = status === 'succeeded';
  const isFailed = status === 'failed';

  // Format relative time
  const timeAgo = useMemo(() => {
    return formatDistanceToNow(new Date(createdAt), { addSuffix: true });
  }, [createdAt]);

  // Display image: result if complete, fallback (input preview) if processing/failed
  const resultImages = resultImageUrls?.length ? resultImageUrls : resultImageUrl ? [resultImageUrl] : [];
  const displayImages = resultImages.length ? resultImages : fallbackImage ? [fallbackImage] : [];

  const handleDownload = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (resultImageUrl) {
        downloadImage(resultImageUrl, downloadFilename);
      }
    },
    [resultImageUrl, downloadFilename],
  );

  const handleRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRetry?.(generation);
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCancel?.(generation);
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isProcessing) {
      onCancel?.(generation);
    }
    onRemove?.(id);
  };

  return (
    <div
      className={cn(
        'group relative rounded-lg border bg-card overflow-hidden transition-all cursor-pointer',
        'hover:border-primary/50 hover:shadow-md',
        isSelected && 'ring-2 ring-primary border-primary',
      )}
      onClick={() => onClick?.(generation)}
    >
      {/* Image Container */}
      <div className="relative aspect-square">
        {displayImages.length > 0 ? (
          <div
            className={cn(
              'absolute inset-0 grid bg-muted',
              displayImages.length > 1 && 'grid-cols-2',
              isProcessing && 'opacity-50 grayscale-[30%]',
              isFailed && 'opacity-40 grayscale',
            )}
          >
            {displayImages.slice(0, 4).map((imageUrl, index) => (
              <div
                key={imageUrl}
                className="relative min-h-0 min-w-0 overflow-hidden"
              >
                <img
                  src={imageUrl}
                  alt={`Generation ${id}${displayImages.length > 1 ? ` result ${index + 1}` : ''}`}
                  className="h-full w-full object-cover"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  loading="lazy"
                />
                {index === 3 && displayImages.length > 4 && (
                  <div className="absolute inset-0 grid place-items-center bg-black/55 text-sm font-medium text-white">
                    +{displayImages.length - 4}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          (placeholder ?? (
            <div className="w-full h-full bg-muted flex items-center justify-center">
              <span className="text-muted-foreground text-sm">No preview</span>
            </div>
          ))
        )}

        {/* Processing Overlay */}
        {isProcessing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40">
            <span className="text-white text-sm font-medium mb-2">{statusMessage || 'Waiting in queue...'}</span>
            <div className="w-3/4">
              <Progress
                value={progress}
                className="h-1.5"
              />
            </div>
          </div>
        )}

        {/* Status Badge - Top Left */}
        <div className="absolute top-2 left-2">
          <GenerationStatusBadge status={status} />
        </div>

        {/* Action Buttons - Top Right */}
        <div
          className={cn(
            'absolute top-2 right-2 flex gap-1 transition-opacity',
            'opacity-0 group-hover:opacity-100',
            isProcessing && 'opacity-100',
          )}
        >
          {isComplete && resultImageUrl && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleDownload}
                  />
                }
              >
                <Download className="h-3.5 w-3.5" />
              </TooltipTrigger>
              <TooltipContent>Download</TooltipContent>
            </Tooltip>
          )}
          {isFailed && onRetry && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleRetry}
                  />
                }
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </TooltipTrigger>
              <TooltipContent>Retry</TooltipContent>
            </Tooltip>
          )}
          {isProcessing && onCancel && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleCancel}
                  />
                }
              >
                <CircleStop className="h-3.5 w-3.5" />
              </TooltipTrigger>
              <TooltipContent>Cancel</TooltipContent>
            </Tooltip>
          )}
          {onRemove && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleRemove}
                  />
                }
              >
                <Trash2 className="h-3.5 w-3.5" />
              </TooltipTrigger>
              <TooltipContent>Remove</TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Error Message Overlay */}
        {isFailed && error && (
          <div className="absolute bottom-0 left-0 right-0 p-2 bg-destructive/90 text-destructive-foreground">
            <div className="flex items-start gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span className="text-xs line-clamp-2">{error}</span>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-2 border-t bg-muted/30">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="truncate">{label}</span>
          <span className="shrink-0">{timeAgo}</span>
        </div>
      </div>
    </div>
  );
}
