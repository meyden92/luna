import { useInfiniteQuery, useQueries } from '@tanstack/react-query';
import { AudioLines, Box, Film } from 'lucide-react';
import { useEffect, useState } from 'react';
import { generationsQueryOptions } from '@/components/studio/queries';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Segmented, type SegmentedItem } from '@/components/ui/segmented';
import { Spinner } from '@/components/ui/spinner';
import { queryKeys } from '@/libs/query-keys';
import { type FileRef, MEDIA_KINDS, type MediaKind } from '@/libs/studio/types';
import { getCDNImage } from '@/libs/utils';
import { getGallery } from '@/server/fns/files';
import styles from './FilePickerDialog.module.css';

type Source = 'files' | 'studio';

const SOURCES: SegmentedItem<Source>[] = [
  { value: 'files', label: 'Your files' },
  { value: 'studio', label: 'Studio history' },
];

/** The Files filter for each media kind Files can hold; Files has no 3D kind. */
const FILE_TYPES = { image: 'image', video: 'video', audio: 'audio' } as const;
const FILES_LIMIT = 60;

interface Pickable {
  key: string;
  ref: FileRef;
  title: string;
  kind: MediaKind;
  /** Shown as the thumbnail for images and videos. */
  src: string | null;
}

/**
 * Picks inputs for a file Field from the User's Files or from their Studio
 * Outputs, offering only the media kinds the Field accepts.
 */
export function FilePickerDialog({
  open,
  onOpenChange,
  accept,
  remaining,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Undefined accepts every kind. */
  accept: MediaKind[] | undefined;
  /** How many more files the input has room for. */
  remaining: number;
  onSelect: (refs: FileRef[]) => void;
}) {
  const kinds = accept ?? MEDIA_KINDS;
  const fileKinds = kinds.flatMap((kind) => (kind in FILE_TYPES ? [kind as keyof typeof FILE_TYPES] : []));
  const [source, setSource] = useState<Source>(fileKinds.length > 0 ? 'files' : 'studio');
  const [picked, setPicked] = useState<Pickable[]>([]);

  useEffect(() => {
    if (open) setPicked([]);
  }, [open]);

  const files = useQueries({
    queries: fileKinds.map((kind) => {
      const filters = { fileType: FILE_TYPES[kind], limit: FILES_LIMIT, sortBy: 'createdAt', sortDirection: 'desc' } as const;
      return {
        queryKey: queryKeys.gallery.list(filters),
        queryFn: () => getGallery({ data: filters }),
        enabled: open && source === 'files',
        staleTime: 30_000,
      };
    }),
  });
  const outputs = useInfiniteQuery({ ...generationsQueryOptions({ mediaKinds: [...kinds] }), enabled: open && source === 'studio' });

  const items = ((): Pickable[] => {
    if (source === 'files') {
      return files
        .flatMap((query, index) => (query.data?.files ?? []).map((file) => ({ file, kind: fileKinds[index] as MediaKind })))
        .sort((a, b) => new Date(b.file.createdAt).getTime() - new Date(a.file.createdAt).getTime())
        .map(({ file, kind }) => ({
          key: `file:${file.id}`,
          ref: { source: 'file', fileId: file.id },
          title: file.title ?? 'Untitled',
          kind,
          src: kind === 'audio' ? null : getCDNImage(`/${file.ownerId}/${file.url}`),
        }));
    }
    return (outputs.data?.pages ?? [])
      .flatMap((page) => page.generations)
      .flatMap((generation) =>
        generation.outputs
          .filter((output) => output.url && kinds.includes(output.mediaKind))
          .map((output) => ({
            key: `output:${output.id}`,
            ref: { source: 'output', outputId: output.id } as const,
            title: generation.outputs.length > 1 ? `${generation.name} ${output.index + 1}` : generation.name,
            kind: output.mediaKind,
            src: output.mediaKind === 'image' || output.mediaKind === 'video' ? output.url : null,
          })),
      );
  })();
  const loading = source === 'files' ? files.some((query) => query.isPending) : outputs.isPending;

  const toggle = (item: Pickable) =>
    setPicked((current) =>
      current.some((entry) => entry.key === item.key)
        ? current.filter((entry) => entry.key !== item.key)
        : current.length < remaining
          ? [...current, item]
          : remaining === 1
            ? [item]
            : current,
    );

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Choose files</DialogTitle>
          <DialogDescription>
            Pick {remaining === 1 ? 'one' : `up to ${remaining}`} from your Files or from what you generated.
          </DialogDescription>
        </DialogHeader>

        {fileKinds.length > 0 && (
          <Segmented
            label="Where to pick from"
            items={SOURCES}
            value={source}
            onValueChange={setSource}
            className={styles.sources}
          />
        )}

        {loading ? (
          <div className={styles.loading}>
            <Spinner />
          </div>
        ) : items.length === 0 ? (
          <p className={styles.none}>{source === 'files' ? 'No matching files yet.' : 'No matching Outputs yet.'}</p>
        ) : (
          <div className={styles.grid}>
            {items.map((item) => (
              <button
                key={item.key}
                type="button"
                title={item.title}
                aria-label={item.title}
                aria-pressed={picked.some((entry) => entry.key === item.key)}
                className={styles.option}
                onClick={() => toggle(item)}
              >
                <Thumbnail item={item} />
              </button>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button
            disabled={picked.length === 0}
            onClick={() => {
              onSelect(picked.map((item) => item.ref));
              onOpenChange(false);
            }}
          >
            Use {picked.length || ''} {picked.length === 1 ? 'file' : 'files'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Thumbnail({ item }: { item: Pickable }) {
  if (item.src && item.kind === 'image') {
    return (
      <img
        src={item.src}
        alt=""
        loading="lazy"
      />
    );
  }
  if (item.src && item.kind === 'video') {
    return (
      <video
        src={item.src}
        muted
        preload="metadata"
      />
    );
  }
  const Icon = item.kind === 'audio' ? AudioLines : item.kind === 'video' ? Film : Box;
  return (
    <span className={styles.placeholder}>
      <Icon size={20} />
      <span className="type-truncate">{item.title}</span>
    </span>
  );
}
