import { useQuery } from '@tanstack/react-query';
import { Clock, ImageIcon, Loader2, Plus, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { queryKeys } from '@/libs/query-keys';
import { formatSize } from '@/libs/utils';
import { listCachedImages } from '@/server/fns/storage';

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
        className="gap-2"
        onClick={() => setIsOpen(true)}
      >
        <ImageIcon className="w-4 h-4" />
        Select from Cache
        {selectedHashes.length > 0 && (
          <Badge
            variant="secondary"
            className="ml-1"
          >
            {selectedHashes.length}
          </Badge>
        )}
      </Button>

      <Dialog
        open={isOpen}
        onOpenChange={setIsOpen}
      >
        <DialogContent size="xl">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center justify-between pr-8">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                <span>Cached Images</span>
                <Badge
                  variant="outline"
                  className="text-xs"
                >
                  {selectedHashes.length}/{maxSelection} selected
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
                className="h-8 w-8 p-0"
              >
                <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
              </Button>
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
            {isLoading && (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
              </div>
            )}

            {error && (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <ImageIcon className="w-16 h-16 text-muted-foreground mb-4" />
                <p className="text-base text-muted-foreground">Failed to load cached images</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => refetch()}
                >
                  Try Again
                </Button>
              </div>
            )}

            {data && data.images.length === 0 && (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <ImageIcon className="w-16 h-16 text-muted-foreground mb-4" />
                <p className="text-base text-muted-foreground">No cached images found</p>
                <p className="text-sm text-muted-foreground mt-2">Images you use for generation will appear here</p>
              </div>
            )}

            {data && data.images.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 pb-4">
                {data.images.map((image) => (
                  <div
                    key={image.hash}
                    className={`
                      relative group cursor-pointer rounded-xl border-2 transition-all overflow-hidden
                      ${isSelected(image.hash) ? 'border-primary ring-2 ring-primary/30' : 'border-transparent hover:border-primary/50'}
                      ${!canSelectMore && !isSelected(image.hash) ? 'opacity-40 cursor-not-allowed' : ''}
                    `}
                    onClick={() => {
                      if (isSelected(image.hash)) {
                        handleImageClick(image);
                      } else if (canSelectMore) {
                        handleImageClick(image);
                      }
                    }}
                  >
                    <div className="aspect-square bg-muted">
                      <img
                        src={image.url}
                        alt={'Cached image'}
                        loading="lazy"
                        className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-200"
                      />
                    </div>

                    {isSelected(image.hash) && (
                      <div className="absolute inset-0 bg-primary/40 flex items-center justify-center">
                        <div className="bg-primary text-primary-foreground rounded-full p-2">
                          <Plus className="w-5 h-5 rotate-45" />
                        </div>
                      </div>
                    )}

                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent text-white text-xs p-2 pt-8">
                      <div className="flex justify-between items-center">
                        <span className="truncate">{formatDate(image.lastModified)}</span>
                        <span className="shrink-0">{formatSize(image.size, CACHE_IMAGE_SIZE_OPTIONS)}</span>
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
