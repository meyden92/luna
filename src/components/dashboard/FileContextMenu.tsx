import { Sparkles, Trash2, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu';
import { getSelectedFileIds, useBulkSelection } from '@/hooks/stores/use-bulk-selection';
import { useClipboard } from '@/hooks/use-copy-to-clipboard';
import useEdit from '@/hooks/use-edit';
import { getCDNImage } from '@/libs/utils';
import type { GalleryFile } from '@/types/project';
import MoveToFolderMenu from './MoveToFolderMenu';

interface FileContextMenuProps {
  file: GalleryFile;
  userId: string;
  handleDeleteAction: (fileId: string) => void;
  children: ReactNode;
  // Bulk editing props - use count to avoid array re-renders
  selectedCount?: number;
  onClearSelection?: () => void;
  onDeleteMultiple?: (fileIds: string[]) => void;
  // Optional callbacks for context menu state
  onContextMenuOpenChange?: (open: boolean) => void;
  triggerClassName?: string;
}

export function FileContextMenu({
  file,
  userId,
  handleDeleteAction,
  children,
  selectedCount = 0,
  onClearSelection,
  onDeleteMultiple,
  onContextMenuOpenChange,
  triggerClassName,
}: FileContextMenuProps) {
  const onOpen = useEdit((state) => state.onOpen);
  const setImage = useEdit((state) => state.setFile);
  const clipboard = useClipboard({ timeout: 2000 });

  const hasMultipleSelected = selectedCount > 0;
  const selectedFileIds = hasMultipleSelected ? getSelectedFileIds(useBulkSelection.getState().selectedFiles) : [];

  const handleBulkDelete = useCallback(() => {
    const selectedFiles = getSelectedFileIds(useBulkSelection.getState().selectedFiles);
    onDeleteMultiple?.(selectedFiles);
  }, [onDeleteMultiple]);

  useEffect(() => {
    if (!clipboard.copied) {
      return;
    }
    toast('Copied Image URL to clipboard', {
      duration: 2000,
      position: 'top-center',
    });
  }, [clipboard.copied]);

  const toggleOpen = useCallback(
    (open: boolean) => {
      onContextMenuOpenChange?.(open);
    },
    [onContextMenuOpenChange],
  );

  return (
    <ContextMenu onOpenChange={toggleOpen}>
      <ContextMenuTrigger className={triggerClassName}>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-64">
        {/* Show ONLY bulk options when files are selected, hide single-file options */}
        {hasMultipleSelected ? (
          <>
            <ContextMenuItem
              className="truncate text-sm font-medium"
              disabled
            >
              {`${selectedCount} ${selectedCount === 1 ? 'file' : 'files'} selected`}
            </ContextMenuItem>
            <ContextMenuItem
              inset
              onClick={onClearSelection}
            >
              <X className="mr-2 h-4 w-4" />
              Clear selection
            </ContextMenuItem>
            <MoveToFolderMenu
              fileIds={selectedFileIds}
              onClose={() => useBulkSelection.getState().clearSelection()}
            />
            <ContextMenuItem
              inset
              onClick={handleBulkDelete}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {`Delete ${selectedCount} ${selectedCount === 1 ? 'File' : 'Files'}`}
            </ContextMenuItem>
          </>
        ) : (
          <>
            {/* Single file options - only show when no bulk selection */}
            <ContextMenuItem
              className="truncate text-sm"
              disabled
            >
              {file.title}
            </ContextMenuItem>
            <ContextMenuItem
              inset
              onClick={() => clipboard.copy(`${window.location.origin}/view/${file.id}`)}
            >
              Copy URL
            </ContextMenuItem>
            <ContextMenuItem
              inset
              onClick={() => clipboard.copy(getCDNImage(`/${userId}/${file.url}`))}
            >
              Copy Direct URL
            </ContextMenuItem>
            <ContextMenuItem
              inset
              render={
                <a
                  href={`/api/download?url=${encodeURIComponent(getCDNImage(`/${userId}/${file.url}`))}`}
                  download={file.title}
                />
              }
            >
              Download
            </ContextMenuItem>
            <ContextMenuSeparator />
            <MoveToFolderMenu fileIds={[file.id]} />
            {file.contentType.startsWith('image/') ? (
              <ContextMenuItem
                inset
                render={<a href={`/beautify/${file.id}`} />}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Beautify
              </ContextMenuItem>
            ) : null}
            <ContextMenuSeparator />
            <ContextMenuItem
              inset
              onClick={() => handleDeleteAction(file.id)}
            >
              Delete
            </ContextMenuItem>
            <ContextMenuItem
              inset
              onClick={() => {
                setImage(file);
                onOpen(file);
              }}
            >
              Edit
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
