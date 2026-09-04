import { formatDistanceToNow } from 'date-fns';
import { AlertCircle, CircleStop, Download, RotateCcw, Trash2 } from 'lucide-react';
import { type ReactNode, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { GenerationStatus } from '@/hooks/stores/image-editor-queue-store';
import { downloadImage } from '@/libs/download';
import styles from './GenerationCard.module.css';
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

  const mediaState = isProcessing ? 'processing' : isFailed ? 'failed' : undefined;

  return (
    <div
      className={styles.card}
      data-selected={isSelected ? '' : undefined}
      onClick={() => onClick?.(generation)}
    >
      {/* Image Container */}
      <div className={styles.media}>
        {displayImages.length > 0 ? (
          <div
            className={styles.images}
            data-multi={displayImages.length > 1 ? '' : undefined}
            data-state={mediaState}
          >
            {displayImages.slice(0, 4).map((imageUrl, index) => (
              <div
                key={imageUrl}
                className={styles.imageCell}
              >
                <img
                  src={imageUrl}
                  alt={`Generation ${id}${displayImages.length > 1 ? ` result ${index + 1}` : ''}`}
                  className={styles.image}
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  loading="lazy"
                />
                {index === 3 && displayImages.length > 4 && <div className={styles.overflowCount}>+{displayImages.length - 4}</div>}
              </div>
            ))}
          </div>
        ) : (
          (placeholder ?? <div className={styles.noPreview}>No preview</div>)
        )}

        {/* Processing Overlay */}
        {isProcessing && (
          <div className={styles.processing}>
            <span className={styles.processingLabel}>{statusMessage || 'Waiting in queue...'}</span>
            <div className={styles.progressWrap}>
              <Progress
                value={progress}
                className={styles.progressBar}
              />
            </div>
          </div>
        )}

        {/* Status Badge - Top Left */}
        <div className={styles.badge}>
          <GenerationStatusBadge status={status} />
        </div>

        {/* Action Buttons - Top Right */}
        <div
          className={styles.actions}
          data-pinned={isProcessing ? '' : undefined}
        >
          {isComplete && resultImageUrl && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="secondary"
                    size="icon"
                    className={styles.actionButton}
                    onClick={handleDownload}
                  />
                }
              >
                <Download className={styles.icon} />
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
                    className={styles.actionButton}
                    onClick={handleRetry}
                  />
                }
              >
                <RotateCcw className={styles.icon} />
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
                    className={styles.actionButton}
                    onClick={handleCancel}
                  />
                }
              >
                <CircleStop className={styles.icon} />
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
                    className={styles.actionButton}
                    onClick={handleRemove}
                  />
                }
              >
                <Trash2 className={styles.icon} />
              </TooltipTrigger>
              <TooltipContent>Remove</TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Error Message Overlay */}
        {isFailed && error && (
          <div className={styles.errorBar}>
            <div className={styles.errorRow}>
              <AlertCircle className={styles.errorIcon} />
              <span className={styles.errorText}>{error}</span>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className={styles.footer}>
        <div className={styles.footerRow}>
          <span className="type-truncate">{label}</span>
          <span className={styles.time}>{timeAgo}</span>
        </div>
      </div>
    </div>
  );
}
