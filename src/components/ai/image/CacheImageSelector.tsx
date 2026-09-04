import { useQuery } from '@tanstack/react-query';
import { Clock, ImageIcon, Loader2, Plus, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { queryKeys } from '@/libs/query-keys';
import { formatSize } from '@/libs/utils';
import { listCachedImages } from '@/server/fns/storage';
import styles from './CacheImageSelector.module.css';

interface CachedImage {
  key: string;
  url: string;
  lastModified?: string;
  size?: number;
  hash: string;
}

interface CachedImagesResponse {
  images: CachedImage[];
  hasMore: boolean;
  nextContinuationToken?: string;
}

interface CacheImageSelectorProps {
  onImageSelect: (imageUrl: string, hash: string) => void;
  onImageDeselect?: (hash: string) => void;
  selectedHashes?: string[];
  maxSelection?: number;
  disabled?: boolean;
  purpose?: string;
}

const CACHE_IMAGE_SIZE_OPTIONS = { unit: 'MB', precision: 1, empty: '' } as const;

export function CacheImageSelector({
  onImageSelect,
  onImageDeselect,
  selectedHashes = [],
  maxSelection = 1,
  disabled = false,
  purpose = 'image-edit',
}: CacheImageSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const { data, isLoading, error, refetch, isFetching } = useQuery<CachedImagesResponse>({
    queryKey: queryKeys.cachedImages.byPurpose(purpose),
    queryFn: async () => {
      return listCachedImages({ data: { page: 1, limit: 100, purpose } }) as Promise<CachedImagesResponse>;
    },
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  const handleImageClick = (image: CachedImage) => {
    const alreadySelected = selectedHashes.includes(image.hash);

    if (alreadySelected) {
      onImageDeselect?.(image.hash);
    } else {
      onImageSelect(image.url, image.hash);
      if (maxSelection === 1) {
        setIsOpen(false);
      }
    }
  };

  const isSelected = (hash: string) => selectedHashes.includes(hash);
  const canSelectMore = selectedHashes.length < maxSelection;

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        className="space-2"
        onClick={() => setIsOpen(true)}
      >
        <ImageIcon />
        Select from Cache
        {selectedHashes.length > 0 && <Badge variant="secondary">{selectedHashes.length}</Badge>}
      </Button>

      <Dialog
        open={isOpen}
        onOpenChange={setIsOpen}
      >
        <DialogContent size="xl">
          <DialogHeader className={styles.header}>
            <DialogTitle className={styles.title}>
              <div className={styles.titleMain}>
                <Clock className={styles.titleIcon} />
                <span>Cached Images</span>
                <Badge variant="outline">
                  {selectedHashes.length}/{maxSelection} selected
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                <RefreshCw className={isFetching ? styles.spinning : undefined} />
              </Button>
            </DialogTitle>
          </DialogHeader>

          <div className={styles.scroll}>
            {isLoading && (
              <div className={styles.state}>
                <Loader2 className={styles.stateSpinner} />
              </div>
            )}

            {error && (
              <div className={styles.state}>
                <ImageIcon className={styles.stateIcon} />
                <p className={styles.stateText}>Failed to load cached images</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="margin-top-4"
                  onClick={() => refetch()}
                >
                  Try Again
                </Button>
              </div>
            )}

            {data && data.images.length === 0 && (
              <div className={styles.state}>
                <ImageIcon className={styles.stateIcon} />
                <p className={styles.stateText}>No cached images found</p>
                <p className={styles.stateHint}>Images you use for generation will appear here</p>
              </div>
            )}

            {data && data.images.length > 0 && (
              <div className={styles.grid}>
                {data.images.map((image) => (
                  <div
                    key={image.hash}
                    className={styles.card}
                    data-selected={isSelected(image.hash) ? '' : undefined}
                    data-disabled={!canSelectMore && !isSelected(image.hash) ? '' : undefined}
                    onClick={() => {
                      if (isSelected(image.hash)) {
                        handleImageClick(image);
                      } else if (canSelectMore) {
                        handleImageClick(image);
                      }
                    }}
                  >
                    <div className={styles.thumb}>
                      <img
                        src={image.url}
                        alt={'Cached image'}
                        loading="lazy"
                        className={styles.image}
                      />
                    </div>

                    {isSelected(image.hash) && (
                      <div className={styles.selectedOverlay}>
                        <div className={styles.selectedMark}>
                          <Plus className={styles.selectedIcon} />
                        </div>
                      </div>
                    )}

                    <div className={styles.meta}>
                      <div className={styles.metaRow}>
                        <span className={styles.metaDate}>{formatDate(image.lastModified)}</span>
                        <span className={styles.metaSize}>{formatSize(image.size, CACHE_IMAGE_SIZE_OPTIONS)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
