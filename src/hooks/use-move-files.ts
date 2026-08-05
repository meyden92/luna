import type { InfiniteData } from '@tanstack/react-query';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useFolders } from '@/contexts/FoldersContext';
import type { GalleryPage } from '@/libs/gallery-cache';
import { queryKeys } from '@/libs/query-keys';
import { moveFiles } from '@/server/fns/files';
import type { GalleryFile } from '@/types/project';

interface FolderData {
  id: string;
  name: string;
  color: string | null;
  _count: { files: number };
}

type GalleryInfiniteData = InfiniteData<GalleryPage>;

type GallerySnapshot = readonly [readonly unknown[], unknown];

interface MoveOptions {
  /** When the file(s) already live in the target folder, move them to root instead (menu behavior). */
  toggle?: boolean;
  onSuccess?: () => void;
}

/**
 * Shared "move files to folder" mutation with optimistic gallery + folder-count
 * updates and rollback on error. Single source of truth for the move flow used
 * by context menus, dropdowns, drag-and-drop and the selection bar.
 */
export function useMoveFiles() {
  const queryClient = useQueryClient();
  const { folders } = useFolders();

  const collectCachedFiles = (fileIds: string[]): GalleryFile[] => {
    // Aggregate matching files across ALL gallery caches (dedup by id) so toggle
    // detection works regardless of which filtered view is active.
    const wanted = new Set(fileIds);
    const cachedFiles = new Map<string, GalleryFile>();

    for (const [, data] of queryClient.getQueriesData<GalleryInfiniteData>({ queryKey: queryKeys.gallery.all })) {
      for (const page of data?.pages ?? []) {
        for (const file of page.files) {
          if (wanted.has(file.id) && !cachedFiles.has(file.id)) {
            cachedFiles.set(file.id, file);
          }
        }
      }
    }

    return [...cachedFiles.values()];
  };

  const { mutate: executeMoveFiles, isPending } = useMutation({
    mutationFn: async (input: { fileIds: string[]; folderId: string | null }) => {
      return moveFiles({ data: input }) as Promise<{ updated: number; folderId: string | null }>;
    },
    onMutate: (input) => {
      const allGalleryCaches = queryClient.getQueriesData<GalleryInfiniteData>({ queryKey: queryKeys.gallery.all });

      // Snapshot affected caches for rollback on error
      const previousFolders = queryClient.getQueryData(queryKeys.folders.all);
      const previousGalleries: GallerySnapshot[] = allGalleryCaches.map(([queryKey, data]) => [queryKey, data] as const);

      const currentFiles = collectCachedFiles(input.fileIds);

      // Resolve the target folder object once
      const targetFolder = input.folderId ? (folders.find((f) => f.id === input.folderId) ?? null) : null;
      const folderObjForMove = targetFolder ? { id: targetFolder.id, name: targetFolder.name, color: targetFolder.color } : null;

      // Optimistically update folder counts
      queryClient.setQueryData<FolderData[]>(queryKeys.folders.all, (old = []) =>
        old.map((folder) => {
          const filesToAdd = currentFiles.filter((file) => file.folderId !== folder.id && input.folderId === folder.id).length;
          const filesToRemove = currentFiles.filter((file) => file.folderId === folder.id && input.folderId !== folder.id).length;

          if (filesToAdd > 0 || filesToRemove > 0) {
            return {
              ...folder,
              _count: { files: folder._count.files + filesToAdd - filesToRemove },
            };
          }
          return folder;
        }),
      );

      // Optimistically update gallery caches - update files' folderId
      allGalleryCaches.forEach(([queryKey]) => {
        // Check cache filters to determine if files should be removed after move
        const filters = queryKey[1] as { excludeFoldered?: boolean; folderId?: string | null } | undefined;
        const hasExcludeFolderedFilter = filters?.excludeFoldered === true;
        const viewingSpecificFolder = filters?.folderId && filters.folderId !== 'null';

        queryClient.setQueryData<GalleryInfiniteData>(queryKey, (oldData) => {
          if (!oldData?.pages) return oldData;

          return {
            ...oldData,
            pages: oldData.pages.map((page) => ({
              ...page,
              files: page.files
                .map((file) => {
                  if (input.fileIds.includes(file.id)) {
                    return { ...file, folderId: input.folderId, folder: folderObjForMove };
                  }
                  return file;
                })
                // Remove files that no longer match the current view's filter
                .filter((file) => {
                  if (!input.fileIds.includes(file.id)) return true;
                  if (hasExcludeFolderedFilter && input.folderId) return false;
                  if (viewingSpecificFolder && input.folderId !== filters.folderId) return false;
                  return true;
                }),
            })),
          };
        });
      });

      return { previousFolders, previousGalleries };
    },
    onSuccess: (data, variables) => {
      // Mark caches as stale without immediate refetch (rely on optimistic update)
      queryClient.invalidateQueries({ queryKey: queryKeys.gallery.all, refetchType: 'none' });
      queryClient.invalidateQueries({ queryKey: queryKeys.folders.all, refetchType: 'none' });

      const folderName = data.folderId ? folders.find((f) => f.id === data.folderId)?.name || 'Unknown Folder' : 'Root';
      const fileLabel = variables.fileIds.length === 1 ? 'File' : `${variables.fileIds.length} files`;
      const action = data.folderId ? 'moved to' : 'removed from folder, moved to';

      toast.success(`${fileLabel} ${action} ${folderName}`, { duration: 3000 });
    },
    onError: (error, _vars, context) => {
      if (context) {
        queryClient.setQueryData(queryKeys.folders.all, context.previousFolders);
        context.previousGalleries.forEach(([key, data]) => {
          queryClient.setQueryData(key, data);
        });
      }
      toast.error(`Failed to move files: ${error.message}`);
    },
  });

  const moveFilesTo = (fileIds: string[], targetFolderId: string | null, options?: MoveOptions) => {
    if (fileIds.length === 0) return;

    let finalFolderId = targetFolderId;
    if (options?.toggle && targetFolderId) {
      // Toggle: if every file is already in the target folder, move to root instead
      const currentFiles = collectCachedFiles(fileIds);
      const allInTarget = currentFiles.length > 0 && currentFiles.every((file) => file.folderId === targetFolderId);
      if (allInTarget) finalFolderId = null;
    }

    executeMoveFiles({ fileIds, folderId: finalFolderId }, { onSuccess: () => options?.onSuccess?.() });
  };

  return { moveFilesTo, isPending };
}
