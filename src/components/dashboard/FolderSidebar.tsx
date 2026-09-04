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
import styles from './FolderSidebar.module.css';

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

function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn(styles.sectionLabel, className)}>{children}</div>;
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

  const widthMode = collapsible ? (isCollapsed ? 'rail' : 'panel') : 'full';

  if (!mounted) {
    return (
      <div
        className={styles.shell}
        data-width={collapsible ? 'panel' : 'full'}
      >
        <div className={styles.placeholder}>
          <div className={styles.placeholderLabel}>Loading…</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className={styles.shell}
        data-width={widthMode}
      >
        <div className={styles.panel}>
          {collapsible && (
            <Button
              size="sm"
              variant="ghost"
              className={styles.collapseToggle}
              onClick={toggleCollapse}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isCollapsed ? <ChevronRight className={styles.toggleIcon} /> : <ChevronLeft className={styles.toggleIcon} />}
            </Button>
          )}

          <div className={styles.inner}>
            {!isCollapsed ? (
              <div className={styles.body}>
                <SectionLabel className="margin-bottom-1">Library</SectionLabel>
                <button
                  type="button"
                  onClick={() => onFolderSelect(null)}
                  aria-current={selectedFolderId === null ? 'true' : undefined}
                  className={styles.item}
                  data-active={selectedFolderId === null || undefined}
                >
                  <LayoutGrid className={styles.itemIcon} />
                  <span className={styles.itemLabel}>All files</span>
                  {storageUsage && <span className={styles.count}>{storageUsage.fileCount}</span>}
                </button>

                <div className={styles.sectionHeader}>
                  <SectionLabel>Folders</SectionLabel>
                  <button
                    type="button"
                    className={styles.addFolder}
                    onClick={() => setIsCreating(true)}
                    disabled={isCreating}
                    aria-label="New folder"
                  >
                    <FolderPlus className={styles.itemIcon} />
                  </button>
                </div>

                {isCreating && (
                  <div className={styles.editCard}>
                    <Input
                      placeholder="Folder name"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      className={styles.editInput}
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
                    <div className={styles.editActions}>
                      <Button
                        size="sm"
                        className={styles.editButton}
                        onClick={handleCreateFolder}
                        disabled={!newFolderName.trim()}
                      >
                        Create
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className={styles.editButton}
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

                <div className={styles.folderList}>
                  {isLoading ? (
                    <div className={styles.listNote}>Loading...</div>
                  ) : optimisticFolders.length === 0 ? (
                    <div className={styles.listNote}>No folders yet</div>
                  ) : (
                    optimisticFolders.map((folder) => {
                      const isSelected = selectedFolderId === folder.id;
                      const folderColor = folder.color || '#6b7280';

                      if (editingId === folder.id) {
                        return (
                          <div
                            key={folder.id}
                            className={styles.editCard}
                          >
                            <Input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className={styles.editInput}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleUpdateFolder(folder.id);
                                } else if (e.key === 'Escape') {
                                  cancelEditing();
                                }
                              }}
                              autoFocus
                            />
                            <div className={styles.editActions}>
                              <Button
                                size="sm"
                                className={styles.editButton}
                                onClick={() => handleUpdateFolder(folder.id)}
                                disabled={!editName.trim()}
                              >
                                Save
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className={styles.editButton}
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
                          className={styles.row}
                          {...dragHandlers(folder.id)}
                        >
                          <button
                            type="button"
                            onClick={() => onFolderSelect(folder.id)}
                            aria-current={isSelected ? 'true' : undefined}
                            className={styles.item}
                            data-active={isSelected || undefined}
                            data-dragover={dragTargetId === folder.id || undefined}
                          >
                            <span
                              className={styles.dot}
                              style={{ backgroundColor: folderColor }}
                            />
                            <span
                              className={styles.itemLabel}
                              title={folder.name}
                            >
                              {folder.name}
                            </span>
                            <span className={styles.count}>{folder._count.files}</span>
                          </button>
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              className={styles.rowMenu}
                              aria-label="Folder options"
                            >
                              <MoreHorizontal className={styles.rowMenuIcon} />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className={styles.menuContent}
                            >
                              <DropdownMenuItem onClick={() => startEditing(folder)}>
                                <Edit3 className={styles.menuIcon} />
                                Rename
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDeleteFolder(folder)}
                                className={styles.menuItemDanger}
                              >
                                <Trash2 className={styles.menuIcon} />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      );
                    })
                  )}
                </div>

                <SectionLabel className="margin-bottom-1 margin-top-4">Utilities</SectionLabel>
                <button
                  type="button"
                  className={styles.item}
                  onClick={() => {
                    onFormSharesListOpenChange?.(true);
                    onNavigate?.();
                  }}
                >
                  <List className={styles.itemIcon} />
                  <span className={styles.itemLabel}>My form shares</span>
                </button>
                <button
                  type="button"
                  className={styles.item}
                  onClick={() => {
                    onFormBuilderOpenChange?.(true);
                    onNavigate?.();
                  }}
                >
                  <FileText className={styles.itemIcon} />
                  <span className={styles.itemLabel}>New form share</span>
                </button>

                <div className={styles.footer}>
                  <div className={styles.footerRow}>
                    <span>{storageUsage ? `${formatSize(storageUsage.totalBytes)} used` : '— used'}</span>
                    <span>{storageUsage ? `${storageUsage.fileCount} files` : ''}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className={styles.rail}>
                <div className={styles.railScroll}>
                  <Tooltip>
                    <TooltipTrigger
                      className={styles.railItem}
                      data-active={selectedFolderId === null || undefined}
                      onClick={() => onFolderSelect(null)}
                      aria-label="All files"
                      aria-current={selectedFolderId === null ? 'true' : undefined}
                    >
                      <LayoutGrid className={styles.railIcon} />
                    </TooltipTrigger>
                    <TooltipContent side="right">All files</TooltipContent>
                  </Tooltip>

                  <div className={styles.railDivider} />

                  {optimisticFolders.map((folder) => {
                    const isSelected = selectedFolderId === folder.id;
                    const folderColor = folder.color || '#6b7280';

                    return (
                      <Tooltip key={folder.id}>
                        <TooltipTrigger
                          className={styles.railItem}
                          data-active={isSelected || undefined}
                          data-dragover={dragTargetId === folder.id || undefined}
                          onClick={() => onFolderSelect(folder.id)}
                          aria-label={`${folder.name} (${folder._count.files})`}
                          aria-current={isSelected ? 'true' : undefined}
                          {...dragHandlers(folder.id)}
                        >
                          <span
                            className={styles.railDot}
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

                <div className={styles.railFooter}>
                  <Tooltip>
                    <TooltipTrigger
                      className={styles.railItem}
                      onClick={() => {
                        onFormSharesListOpenChange?.(true);
                        onNavigate?.();
                      }}
                      aria-label="My form shares"
                    >
                      <List className={styles.railIcon} />
                    </TooltipTrigger>
                    <TooltipContent side="right">My form shares</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger
                      className={styles.railItem}
                      onClick={() => {
                        onFormBuilderOpenChange?.(true);
                        onNavigate?.();
                      }}
                      aria-label="New form share"
                    >
                      <FileText className={styles.railIcon} />
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
