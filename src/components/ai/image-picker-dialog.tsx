import { useQuery } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Segmented, type SegmentedItem } from '@/components/ui/segmented';
import { Spinner } from '@/components/ui/spinner';
import { queryKeys } from '@/libs/query-keys';
import { getCDNImage } from '@/libs/utils';
import { listPreviousReferenceImages } from '@/server/fns/ai';
import { getGallery } from '@/server/fns/files';
import styles from './image-picker-dialog.module.css';
import { loadImageDimensions, type ReferenceImage, referenceImagesFromUrls } from './reference-image';

const PICKER_FILTERS = { fileType: 'image', limit: 100, sortBy: 'createdAt', sortDirection: 'desc' } as const;

type PickerSource = 'files' | 'previous';

const SOURCE_ITEMS: SegmentedItem<PickerSource>[] = [
  { value: 'files', label: 'Your files' },
  { value: 'previous', label: 'Used before' },
];

interface ImagePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** How many more images the caller has room for. */
  remaining: number;
  onSelect: (images: ReferenceImage[]) => void;
  /** Also offer the images uploaded to Edit before, which are kept apart from Files. */
  previousUploads?: boolean;
}

/** A local file needs no round trip: it is already the File the stream uploads. */
async function referenceImagesFromFiles(files: File[]): Promise<ReferenceImage[]> {
  const timestamp = Date.now();
  return Promise.all(
    files.map(async (file, index) => {
      const preview = URL.createObjectURL(file);
      const { width, height } = await loadImageDimensions(preview);
      return { id: `upload-${timestamp}-${index}`, file, preview, width, height };
    }),
  );
}

/**
 * Picks reference images from the images already in Files, from the ones used
 * in Edit before (when `previousUploads` is set), or from the computer. Picks
 * are kept across a source switch, so one choice can mix both.
 */
function ImagePickerDialog({ open, onOpenChange, remaining, onSelect, previousUploads = false }: ImagePickerDialogProps) {
  const [source, setSource] = React.useState<PickerSource>('files');
  const [picked, setPicked] = React.useState<string[]>([]);
  const [preparing, setPreparing] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.gallery.list(PICKER_FILTERS),
    queryFn: () => getGallery({ data: PICKER_FILTERS }),
    staleTime: 30_000,
    enabled: open && source === 'files',
  });

  const { data: previous, isLoading: previousLoading } = useQuery({
    queryKey: queryKeys.cachedImages.byPurpose('image-edit'),
    queryFn: () => listPreviousReferenceImages(),
    staleTime: 30_000,
    enabled: open && source === 'previous',
  });

  // Each opening starts from nothing selected, on the user's own files.
  React.useEffect(() => {
    if (open) {
      setPicked([]);
      setSource('files');
    }
  }, [open]);

  const images = React.useMemo(
    () =>
      source === 'previous'
        ? (previous ?? []).map((image) => ({ id: image.id, title: image.filename, src: image.url }))
        : (data?.files ?? []).map((file) => ({ id: file.id, title: file.title, src: getCDNImage(`/${file.ownerId}/${file.url}`) })),
    [data, previous, source],
  );
  const loading = source === 'previous' ? previousLoading : isLoading;

  const toggle = (src: string) => {
    setPicked((current) => {
      if (current.includes(src)) return current.filter((entry) => entry !== src);
      return current.length < remaining ? [...current, src] : current;
    });
  };

  const commit = async (prepare: () => Promise<ReferenceImage[]>) => {
    setPreparing(true);
    try {
      onSelect(await prepare());
      onOpenChange(false);
    } catch {
      toast.error('Could not load those images');
    } finally {
      setPreparing(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Choose reference images</DialogTitle>
          <DialogDescription>
            Pick up to {remaining} from your files{previousUploads ? ' or from images you used before' : ''}.
          </DialogDescription>
        </DialogHeader>

        {previousUploads && (
          <Segmented
            label="Where to pick from"
            items={SOURCE_ITEMS}
            value={source}
            onValueChange={setSource}
            className={styles.sources}
          />
        )}

        {loading ? (
          <div className={styles.loading}>
            <Spinner />
          </div>
        ) : images.length === 0 ? (
          <p className={styles.none}>
            {source === 'previous'
              ? 'Nothing used before yet. Images you add to Edit from your computer show up here.'
              : 'You have no images yet. Add one from your computer instead.'}
          </p>
        ) : (
          <div className={styles.grid}>
            {images.map((image) => (
              <button
                key={image.id}
                type="button"
                title={image.title ?? undefined}
                data-picked={picked.includes(image.src) || undefined}
                className={styles.option}
                onClick={() => toggle(image.src)}
              >
                <img
                  src={image.src}
                  alt=""
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}

        <DialogFooter className={styles.footer}>
          <Button
            variant="outline"
            disabled={preparing}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload />
            From computer
          </Button>
          <Button
            disabled={picked.length === 0 || preparing}
            onClick={() => void commit(() => referenceImagesFromUrls(picked, 'picked'))}
          >
            {preparing && <Spinner />}
            Use {picked.length || ''} {picked.length === 1 ? 'image' : 'images'}
          </Button>
        </DialogFooter>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []).slice(0, remaining);
            event.target.value = '';
            if (files.length > 0) void commit(() => referenceImagesFromFiles(files));
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export { ImagePickerDialog };
