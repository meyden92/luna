import { AlertCircle, Copy, Download, FolderPlus, Maximize2, MoreHorizontal, Wand2 } from 'lucide-react';
import * as React from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useFolders } from '@/contexts/FoldersContext';
import { ResultLightbox } from './result-lightbox';
import styles from './result-tile.module.css';

interface ResultTileProps {
  /** Finished image, or null while the run is still working. */
  src: string | null;
  /** The stored file this image became; absent when storing it failed. */
  fileId?: string;
  /** False when this tab's stream does not report file ids at all. */
  fileIdReported?: boolean;
  /** width / height of the shape that produced it. */
  ratio: number;
  /** Position in the run, so tiles develop one after another. */
  index: number;
  /** Why this one result failed, when the rest of the run succeeded. */
  error?: string;
  onCopy: (src: string) => void;
  onSaveToFolder: (fileId: string, folderId: string | null) => void;
  onUseInEdit: (src: string) => void;
  onDownload: (src: string) => void;
}

/**
 * One generated image. It shimmers while the run is in flight, then "develops"
 * into focus, and reveals its actions on hover.
 */
function ResultTile({
  src,
  fileId,
  fileIdReported = true,
  ratio,
  index,
  error,
  onCopy,
  onSaveToFolder,
  onUseInEdit,
  onDownload,
}: ResultTileProps) {
  const { folders } = useFolders();
  const [fullSizeOpen, setFullSizeOpen] = React.useState(false);

  return (
    <div
      className={styles.tile}
      // Runtime values: the shape of this run and its place in the stagger.
      style={{ aspectRatio: ratio, '--develop-delay': `${index * 90}ms` } as React.CSSProperties}
    >
      {src ? (
        <img
          className={styles.image}
          src={src}
          alt=""
        />
      ) : error ? (
        <div className={styles.failed}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      ) : (
        <Skeleton className={styles.shimmer} />
      )}

      {src && (
        <>
          <span
            aria-hidden
            className={styles.shade}
          />
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.chip}
              onClick={() => onCopy(src)}
            >
              <Copy size={13} />
              Copy image
            </button>
            {/* Without a file id the image never reached Files, so there is
                nothing to move — the chip says so rather than offering folders. */}
            {fileId ? (
              <DropdownMenu>
                <DropdownMenuTrigger className={styles.chip}>
                  <FolderPlus size={13} />
                  Save to files
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {folders.map((folder) => (
                    <DropdownMenuItem
                      key={folder.id}
                      onClick={() => onSaveToFolder(fileId, folder.id)}
                    >
                      {folder.name}
                    </DropdownMenuItem>
                  ))}
                  {folders.length > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuItem onClick={() => onSaveToFolder(fileId, null)}>Not in a folder</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : fileIdReported ? (
              <span
                className={styles.chip}
                data-muted
                title="This image could not be stored in your files"
              >
                <FolderPlus size={13} />
                Not in your files
              </span>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="More actions"
                data-icon
                className={styles.chip}
              >
                <MoreHorizontal size={14} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onUseInEdit(src)}>
                  <Wand2 />
                  Use in Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDownload(src)}>
                  <Download />
                  Download
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFullSizeOpen(true)}>
                  <Maximize2 />
                  Open full size
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <ResultLightbox
            src={src}
            open={fullSizeOpen}
            onOpenChange={setFullSizeOpen}
          />
        </>
      )}
    </div>
  );
}

export { ResultTile };
