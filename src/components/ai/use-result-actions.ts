import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { toast } from 'sonner';
import { useFolders } from '@/contexts/FoldersContext';
import { downloadImage } from '@/libs/download';
import { queryKeys } from '@/libs/query-keys';
import { moveFiles } from '@/server/fns/files';

/** The actions a result tile offers that do not depend on which tab it sits in. */
export interface ResultActions {
  onCopy: (src: string) => void;
  onSaveToFolder: (fileId: string, folderId: string | null) => void;
  onDownload: (src: string) => void;
}

/** Copies the image itself, not its link. The proxy is needed: the CDN is another origin. */
async function copyImageToClipboard(src: string) {
  const { downloadProxy } = await import('@/server/fns/files');
  const response = await downloadProxy({ data: { url: src } });
  const blob = await response.blob();
  await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })]);
}

/** Filename for a downloaded result: the model or template, then today's date. */
export function resultDownloadFilename(label: string) {
  const date = new Date().toISOString().slice(0, 10);
  const slug = label.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  return `${slug}-${date}.png`;
}

/**
 * Copy / move-to-folder / download for generated images. Shared by the Create,
 * Edit and Templates canvases so all three behave the same.
 *
 * A generated image is already a file by the time it reaches the canvas — the
 * stream stores it and reports its id — so these actions work on that id
 * directly rather than looking the file up again.
 */
export function useResultActions(downloadFilename: (src: string) => string): ResultActions {
  const queryClient = useQueryClient();
  const { folders } = useFolders();

  const onCopy = React.useCallback((src: string) => {
    void copyImageToClipboard(src).then(
      () => toast.success('Image copied to clipboard'),
      () => toast.error('Could not copy the image'),
    );
  }, []);

  const onSaveToFolder = React.useCallback(
    (fileId: string, folderId: string | null) => {
      const folderName = folders.find((folder) => folder.id === folderId)?.name;
      void (async () => {
        try {
          await moveFiles({ data: { fileIds: [fileId], folderId } });
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: queryKeys.gallery.all }),
            queryClient.invalidateQueries({ queryKey: queryKeys.folders.all }),
          ]);
          toast.success(folderName ? `Image saved to ${folderName}` : 'Image moved out of its folder');
        } catch {
          toast.error('Could not save the image');
        }
      })();
    },
    [folders, queryClient],
  );

  const onDownload = React.useCallback(
    (src: string) => {
      void downloadImage(src, downloadFilename(src));
    },
    [downloadFilename],
  );

  return React.useMemo(() => ({ onCopy, onSaveToFolder, onDownload }), [onCopy, onSaveToFolder, onDownload]);
}
