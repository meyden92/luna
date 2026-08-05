import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Edit3, FileText, FolderPlus, LayoutGrid, List, MoreHorizontal, Trash2 } from 'lucide-react';
import { useEffect, useOptimistic, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { FILE_DRAG_TYPE } from '@/components/dashboard/GalleryEntry';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useFolders } from '@/contexts/FoldersContext';
import { useGalleryFilters } from '@/hooks/stores/use-gallery-filters';
import { useConfirmation } from '@/hooks/use-confirmation';
import { useMoveFiles } from '@/hooks/use-move-files';
import { patchGalleryFiles } from '@/libs/gallery-cache';
import { queryKeys } from '@/libs/query-keys';
import { cn, formatSize } from '@/libs/utils';
import { createFolder, deleteFolder, updateFolder } from '@/server/fns/folders';
import { getStorageUsage } from '@/server/fns/storage';

type FolderType = {
  id: string;
  name: string;
  color: string | null;
  isDeleted: boolean;
  deletedAt: Date | null;
  ownerId: string;
  _count: { files: number };
  createdAt: Date;
  updatedAt: Date;
};

type OptimisticFolderAction =
  | { type: 'create'; folder: FolderType }
  | { type: 'update'; id: string; updates: Partial<Pick<FolderType, 'name' | 'color'>> }
  | { type: 'delete'; id: string };

interface FolderSidebarProps {
  onFormSharesListOpenChange?: (open: boolean) => void;
  onFormBuilderOpenChange?: (open: boolean) => void;
  onNavigate?: () => void;
  collapsible?: boolean;
}

const defaultColors = [
  '#ef4444', // red-500
  '#f97316', // orange-500
  '#eab308', // yellow-500
  '#22c55e', // green-500
  '#06b6d4', // cyan-500
  '#3b82f6', // blue-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
];

const COLLAPSED_WIDTH = 'w-[68px]';
const EXPANDED_WIDTH = 'w-[242px]';

function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('px-2.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.15em] text-luna-ink-4', className)}>
      {children}
    </div>
  );
}

/** Reads gallery-file ids from a native drag event; null when the drag isn't an internal file drag. */
function readDraggedFileIds(e: React.DragEvent): string[] | null {
  if (!e.dataTransfer.types.includes(FILE_DRAG_TYPE)) return null;
  try {
    const ids = JSON.parse(e.dataTransfer.getData(FILE_DRAG_TYPE));
    return Array.isArray(ids) && ids.length > 0 ? ids : null;
  } catch {
    return null;
  }
}

function FolderSidebar({ onFormSharesListOpenChange, onFormBuilderOpenChange, onNavigate, collapsible = true }: FolderSidebarProps) {
  const queryClient = useQueryClient();
  const selectedFolderId = useGalleryFilters((state) => state.filters.folderId ?? null);
  const setFolderId = useGalleryFilters((state) => state.setFolderId);
  const applyFilters = useGalleryFilters((state) => state.applyFilters);
  const onFolderSelect = (folderId: string | null) => {
    setFolderId(folderId);
    applyFilters();
    onNavigate?.();
  };
  const [, startTransition] = useTransition();
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [editName, setEditName] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [dragTargetId, setDragTargetId] = useState<string | null>(null);

  const { confirm, ConfirmationDialog } = useConfirmation<string>();
  const { moveFilesTo } = useMoveFiles();

  const { data: storageUsage } = useQuery({
    queryKey: queryKeys.storage.usage,
    queryFn: () => getStorageUsage(),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    setMounted(true);
    const saved = collapsible ? localStorage.getItem('folderSidebarCollapsed') : null;
    if (saved !== null) {
      setIsCollapsed(saved === 'true');
    }
  }, [collapsible]);

  const toggleCollapse = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem('folderSidebarCollapsed', String(newState));
  };

  const { folders: contextFolders, isLoading } = useFolders();
  const folders = contextFolders as FolderType[];

  const [optimisticFolders, addOptimisticFolder] = useOptimistic(folders, (state, action: OptimisticFolderAction) => {
    switch (action.type) {
      case 'create':
        return [action.folder, ...state];
      case 'update':
        return state.map((folder) => (folder.id === action.id ? { ...folder, ...action.updates } : folder));
      case 'delete':
        return state.filter((folder) => folder.id !== action.id);
      default:
        return state;
    }
  });

  const { mutate: executeCreateFolder } = useMutation({
    mutationFn: async (input: { name: string; color?: string }) => {
      return createFolder({ data: input });
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.folders.all, (old: FolderType[] = []) => [data, ...old]);
      toast.success('Folder created successfully');
      setIsCreating(false);
      setNewFolderName('');
    },
    onError: (error) => {
      toast.error(`Failed to create folder: ${error.message}`);
      setIsCreating(false);
    },
  });

  const { mutate: executeUpdateFolder } = useMutation({
    mutationFn: async (input: { id: string; name?: string; color?: string }) => {
      return updateFolder({ data: input });
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.folders.all, (old: FolderType[] = []) =>
        old.map((folder) => (folder.id === data.id ? data : folder)),
      );

      patchGalleryFiles(queryClient, (file) =>
        file.folderId === data.id && file.folder ? { ...file, folder: { id: data.id, name: data.name, color: data.color } } : file,
      );

      toast.success('Folder updated successfully');
      setEditingId(null);
      setEditName('');
    },
    onError: (error) => {
      toast.error(`Failed to update folder: ${error.message}`);
      setEditingId(null);
    },
  });

  const { mutate: executeDeleteFolder } = useMutation({
    mutationFn: async (input: { id: string }) => {
      return deleteFolder({ data: { id: input.id } }) as Promise<{ id: string; filesCount: number }>;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.folders.all, (old: FolderType[] = []) => old.filter((folder) => folder.id !== data.id));
      queryClient.invalidateQueries({ queryKey: queryKeys.gallery.all });

      if (selectedFolderId === data.id) {
        onFolderSelect(null);
      }

      toast.success(data.filesCount > 0 ? `Folder deleted and ${data.filesCount} files moved to root` : 'Folder deleted successfully');
    },
    onError: (error) => {
      toast.error(`Failed to delete folder: ${error.message}`);
    },
  });

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;

    const randomColor = defaultColors[Math.floor(Math.random() * defaultColors.length)] || null;
    const tempId = `temp-${Date.now()}`;

    startTransition(() => {
      addOptimisticFolder({
        type: 'create',
        folder: {
          id: tempId,
          name: newFolderName.trim(),
          color: randomColor,
          isDeleted: false,
          deletedAt: null,
          ownerId: '',
          _count: { files: 0 },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    });

    executeCreateFolder({
      name: newFolderName.trim(),
      color: randomColor || undefined,
    });
  };

  const handleUpdateFolder = (id: string) => {
    if (!editName.trim()) return;

    startTransition(() => {
      addOptimisticFolder({
        type: 'update',
        id,
        updates: { name: editName.trim() },
      });
    });

    executeUpdateFolder({
      id,
      name: editName.trim(),
    });
  };

  const handleDeleteFolder = (folder: FolderType) => {
    const fileWord = folder._count.files === 1 ? 'file' : 'files';
    const message =
      folder._count.files > 0
        ? `This will delete "${folder.name}" and move ${folder._count.files} ${fileWord} to the root folder.`
        : `This will permanently delete "${folder.name}".`;

    confirm({
      title: 'Delete Folder',
      description: message,
      data: folder.id,
      onConfirm: (folderId) => {
        startTransition(() => {
          addOptimisticFolder({
            type: 'delete',
            id: folderId,
          });
        });

        executeDeleteFolder({ id: folderId });
      },
    });
  };

  const startEditing = (folder: FolderType) => {
    setEditingId(folder.id);
    setEditName(folder.name);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditName('');
  };

  const handleFolderDrop = (e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    setDragTargetId(null);
    const ids = readDraggedFileIds(e);
    if (ids) moveFilesTo(ids, folderId);
  };

  const dragHandlers = (folderId: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(FILE_DRAG_TYPE)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragTargetId(folderId);
    },
    onDragLeave: (e: React.DragEvent) => {
      // dragleave also fires when entering a child of the row — ignore those
      if (e.currentTarget.contains(e.relatedTarget as Node)) return;
      setDragTargetId((current) => (current === folderId ? null : current));
    },
    onDrop: (e: React.DragEvent) => handleFolderDrop(e, folderId),
  });

  const sideItemClass = (active: boolean, dragOver = false) =>
    cn(
      'flex h-[34px] w-full items-center gap-2.5 rounded-lg border border-dashed border-transparent px-2.5 text-left text-[13.5px] font-medium text-luna-ink-2 transition-colors',
      'hover:bg-luna-bg-2',
      active && 'bg-luna-accent-soft text-luna-accent-2 dark:text-luna-accent',
      dragOver && 'border-luna-accent bg-luna-accent-soft',
    );

  const sidebarWidth = collapsible ? (isCollapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH) : 'w-full';

  if (!mounted) {
    return (
      <div className={`h-full shrink-0 ${collapsible ? EXPANDED_WIDTH : 'w-full'}`}>
        <div className="h-full border-r border-luna-line p-3">
          <div className="p-2 font-mono text-[10.5px] uppercase tracking-[0.15em] text-luna-ink-4">Loading…</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`h-full shrink-0 transition-all duration-300 ease-in-out ${sidebarWidth}`}>
        <div className="relative flex h-full flex-col border-r border-luna-line">
          {collapsible && (
            <Button
              size="sm"
              variant="ghost"
              className="absolute -right-3 top-3 z-10 h-7 w-7 rounded-full border border-luna-line bg-luna-bg p-0 shadow-sm"
              onClick={toggleCollapse}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
            </Button>
          )}

          <div className="relative flex h-full flex-col overflow-hidden">
            {!isCollapsed ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-4 pt-[18px]">
                <SectionLabel className="mb-1.5">Library</SectionLabel>
                <button
                  type="button"
                  onClick={() => onFolderSelect(null)}
                  aria-current={selectedFolderId === null ? 'true' : undefined}
                  className={sideItemClass(selectedFolderId === null)}
                >
                  <LayoutGrid className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">All files</span>
                  {storageUsage && <span className="font-mono text-[11px] text-luna-ink-4">{storageUsage.fileCount}</span>}
                </button>

                <div className="mb-1.5 mt-[18px] flex items-center justify-between">
                  <SectionLabel>Folders</SectionLabel>
                  <button
                    type="button"
                    className="-my-1 mr-1 flex h-6 w-6 items-center justify-center rounded-md text-luna-ink-4 transition-colors hover:bg-luna-bg-2 hover:text-luna-ink disabled:opacity-50"
                    onClick={() => setIsCreating(true)}
                    disabled={isCreating}
                    aria-label="New folder"
                  >
                    <FolderPlus className="h-3.5 w-3.5" />
                  </button>
                </div>

                {isCreating && (
                  <div className="mb-2 space-y-2 rounded-lg border border-luna-line bg-luna-bg p-2.5">
                    <Input
                      placeholder="Folder name"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      className="h-9 rounded-md text-sm"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleCreateFolder();
                        } else if (e.key === 'Escape') {
                          setIsCreating(false);
                          setNewFolderName('');
                        }
                      }}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="h-8 flex-1 rounded-md text-xs"
                        onClick={handleCreateFolder}
                        disabled={!newFolderName.trim()}
                      >
                        Create
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 flex-1 rounded-md text-xs"
                        onClick={() => {
                          setIsCreating(false);
                          setNewFolderName('');
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-px">
                  {isLoading ? (
                    <div className="rounded-lg border border-dashed border-luna-line-2 p-4 text-xs text-luna-ink-4">Loading...</div>
                  ) : optimisticFolders.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-luna-line-2 p-4 text-xs text-luna-ink-4">No folders yet</div>
                  ) : (
                    optimisticFolders.map((folder) => {
                      const isSelected = selectedFolderId === folder.id;
                      const folderColor = folder.color || '#6b7280';

                      if (editingId === folder.id) {
                        return (
                          <div
                            key={folder.id}
                            className="space-y-2 rounded-lg border border-luna-line bg-luna-bg p-2.5"
                          >
                            <Input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="h-9 rounded-md text-sm"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleUpdateFolder(folder.id);
                                } else if (e.key === 'Escape') {
                                  cancelEditing();
                                }
                              }}
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                className="h-8 flex-1 rounded-md text-xs"
                                onClick={() => handleUpdateFolder(folder.id)}
                                disabled={!editName.trim()}
                              >
                                Save
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 flex-1 rounded-md text-xs"
                                onClick={cancelEditing}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={folder.id}
                          className="group/folder relative"
                          {...dragHandlers(folder.id)}
                        >
                          <button
                            type="button"
                            onClick={() => onFolderSelect(folder.id)}
                            aria-current={isSelected ? 'true' : undefined}
                            className={sideItemClass(isSelected, dragTargetId === folder.id)}
                          >
                            <span
                              className="mx-[3px] h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: folderColor }}
                            />
                            <span
                              className="min-w-0 flex-1 truncate"
                              title={folder.name}
                            >
                              {folder.name}
                            </span>
                            <span
                              className={cn(
                                'font-mono text-[11px] text-luna-ink-4 transition-opacity group-hover/folder:opacity-0',
                                isSelected && 'text-inherit opacity-75',
                              )}
                            >
                              {folder._count.files}
                            </span>
                          </button>
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-luna-ink-4 opacity-0 transition-opacity hover:bg-luna-bg-3 hover:text-luna-ink group-hover/folder:opacity-100 data-[state=open]:opacity-100"
                              aria-label="Folder options"
                            >
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="w-36"
                            >
                              <DropdownMenuItem onClick={() => startEditing(folder)}>
                                <Edit3 className="mr-2 h-3 w-3" />
                                Rename
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDeleteFolder(folder)}
                                className="text-destructive"
                              >
                                <Trash2 className="mr-2 h-3 w-3" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      );
                    })
                  )}
                </div>

                <SectionLabel className="mb-1.5 mt-[18px]">Utilities</SectionLabel>
                <button
                  type="button"
                  className={sideItemClass(false)}
                  onClick={() => {
                    onFormSharesListOpenChange?.(true);
                    onNavigate?.();
                  }}
                >
                  <List className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">My form shares</span>
                </button>
                <button
                  type="button"
                  className={sideItemClass(false)}
                  onClick={() => {
                    onFormBuilderOpenChange?.(true);
                    onNavigate?.();
                  }}
                >
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">New form share</span>
                </button>

                <div className="mt-auto border-t border-luna-line px-2.5 pb-0.5 pt-3.5">
                  <div className="flex justify-between font-mono text-[10.5px] text-luna-ink-4">
                    <span>{storageUsage ? `${formatSize(storageUsage.totalBytes)} used` : '— used'}</span>
                    <span>{storageUsage ? `${storageUsage.fileCount} files` : ''}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 flex-col overflow-hidden px-2 pb-2 pt-3">
                <div className="flex flex-1 flex-col items-center gap-2 overflow-y-auto">
                  <Tooltip>
                    <TooltipTrigger
                      className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-lg border transition-colors',
                        selectedFolderId === null
                          ? 'border-luna-accent/40 bg-luna-accent-soft text-luna-accent-2 dark:text-luna-accent'
                          : 'border-luna-line bg-luna-bg hover:bg-luna-bg-2',
                      )}
                      onClick={() => onFolderSelect(null)}
                      aria-label="All files"
                      aria-current={selectedFolderId === null ? 'true' : undefined}
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </TooltipTrigger>
                    <TooltipContent side="right">All files</TooltipContent>
                  </Tooltip>

                  <div className="my-1 h-px w-8 bg-luna-line" />

                  {optimisticFolders.map((folder) => {
                    const isSelected = selectedFolderId === folder.id;
                    const folderColor = folder.color || '#6b7280';

                    return (
                      <Tooltip key={folder.id}>
                        <TooltipTrigger
                          className={cn(
                            'flex h-10 w-10 items-center justify-center rounded-lg border transition-colors duration-150',
                            isSelected ? 'border-luna-accent/40 bg-luna-accent-soft' : 'border-luna-line bg-luna-bg hover:bg-luna-bg-2',
                            dragTargetId === folder.id && 'border-dashed border-luna-accent bg-luna-accent-soft',
                          )}
                          onClick={() => onFolderSelect(folder.id)}
                          aria-label={`${folder.name} (${folder._count.files})`}
                          aria-current={isSelected ? 'true' : undefined}
                          {...dragHandlers(folder.id)}
                        >
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: folderColor }}
                          />
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          {folder.name} ({folder._count.files})
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>

                <div className="mt-2 flex shrink-0 flex-col items-center gap-2 border-t border-luna-line pt-3">
                  <Tooltip>
                    <TooltipTrigger
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-luna-line bg-luna-bg p-0 transition-colors hover:bg-luna-bg-2"
                      onClick={() => {
                        onFormSharesListOpenChange?.(true);
                        onNavigate?.();
                      }}
                      aria-label="My form shares"
                    >
                      <List className="h-4 w-4" />
                    </TooltipTrigger>
                    <TooltipContent side="right">My form shares</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-luna-line bg-luna-bg p-0 transition-colors hover:bg-luna-bg-2"
                      onClick={() => {
                        onFormBuilderOpenChange?.(true);
                        onNavigate?.();
                      }}
                      aria-label="New form share"
                    >
                      <FileText className="h-4 w-4" />
                    </TooltipTrigger>
                    <TooltipContent side="right">New form share</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmationDialog />
    </>
  );
}

export default FolderSidebar;
