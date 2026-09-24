import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Inbox, LayoutGrid, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { ConfirmDeleteDialog } from '@/components/dashboard/ConfirmDeleteDialog';
import { isFileDrag, readDraggedFileIds } from '@/components/dashboard/file-drag';
import { AnimatedCount } from '@/components/ui/animated-count';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useFolders } from '@/contexts/FoldersContext';
import { type FilesScope, useGalleryFilters } from '@/hooks/stores/use-gallery-filters';
import { useMoveFiles } from '@/hooks/use-move-files';
import { FOLDER_COLOR_NONE, nextFolderColor } from '@/libs/folder-colors';
import { patchGalleryFiles } from '@/libs/gallery-cache';
import { queryKeys } from '@/libs/query-keys';
import { formatSize } from '@/libs/utils';
import { getGalleryCount } from '@/server/fns/files';
import { createFolder, deleteFolder, updateFolder } from '@/server/fns/folders';
import { getStorageUsage } from '@/server/fns/storage';
import styles from './FolderSidebar.module.css';

type FolderRow = {
  id: string;
  name: string;
  color: string | null;
  _count: { files: number };
};

type FolderSidebarProps = {
  /** Opens the form-shares list, which the Sharing section links to. */
  onFormSharesOpen: () => void;
};

/**
 * One sidebar row. Everything but "All files" is a drop target, so the row owns
 * the drag state rather than the sidebar tracking an id — a row is either being
 * dragged over or it is not.
 */
function Row({
  icon,
  label,
  count,
  active,
  onSelect,
  onDropFiles,
  children,
}: {
  icon?: React.ReactNode;
  label: string;
  count?: number;
  active: boolean;
  onSelect: () => void;
  /** Omitted for "All files", which is where files already are. */
  onDropFiles?: (fileIds: string[]) => void;
  /** The hover menu, for rows that have one. */
  children?: React.ReactNode;
}) {
  const [dropping, setDropping] = React.useState(false);

  return (
    <div className={styles.rowWrap}>
      <button
        type="button"
        className={styles.row}
        data-active={active || undefined}
        data-dropping={dropping || undefined}
        onClick={onSelect}
        onDragOver={
          onDropFiles &&
          ((event) => {
            if (!isFileDrag(event)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            setDropping(true);
          })
        }
        onDragLeave={onDropFiles && (() => setDropping(false))}
        onDrop={
          onDropFiles &&
          ((event) => {
            const ids = readDraggedFileIds(event);
            setDropping(false);
            if (!ids) return;
            event.preventDefault();
            onDropFiles(ids);
          })
        }
      >
        {icon}
        <span className={styles.rowName}>{label}</span>
        {count !== undefined && (
          <AnimatedCount
            value={count}
            className={styles.rowCount}
          />
        )}
      </button>
      {children}
    </div>
  );
}

/** The inline "Folder name" field: Enter creates, Esc cancels, blur commits. */
function NewFolderField({ onCreate, onCancel }: { onCreate: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = React.useState('');

  const commit = () => {
    const trimmed = name.trim();
    if (trimmed) onCreate(trimmed);
    else onCancel();
  };

  return (
    <div className={styles.newFolder}>
      <Input
        autoFocus
        value={name}
        placeholder="Folder name"
        aria-label="Folder name"
        className={styles.newFolderInput}
        onChange={(event) => setName(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
          }
        }}
      />
    </div>
  );
}

/**
 * The Files sidebar: where you are, and where you can drag files to.
 *
 * It renders on Files only — it used to live in the `_dashboard` layout, where
 * it was dead weight on every page that has no files (#57). The collapse-to-rail
 * mode went with the move: a 232px column that is always there is one less
 * thing to think about than one that might be 56px wide.
 */
function FolderSidebar({ onFormSharesOpen }: FolderSidebarProps) {
  const queryClient = useQueryClient();
  const { folders } = useFolders();
  const scope = useGalleryFilters((state) => state.scope);
  const setScope = useGalleryFilters((state) => state.setScope);
  const { moveFilesTo } = useMoveFiles();

  const [creating, setCreating] = React.useState(false);
  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const [deletingFolder, setDeletingFolder] = React.useState<FolderRow | null>(null);

  /*
   * The two scopes that are not folders still have a size, and it is the number
   * §3.2 compares the page head against — so it comes from the same server count
   * the head uses rather than from whatever happens to be loaded.
   */
  const { data: allFilesCount } = useQuery({
    queryKey: queryKeys.gallery.count({}),
    queryFn: () => getGalleryCount({ data: {} }),
    staleTime: 60 * 1000,
  });
  const { data: unfiledCount } = useQuery({
    queryKey: queryKeys.gallery.count({ excludeFoldered: true }),
    queryFn: () => getGalleryCount({ data: { excludeFoldered: true } }),
    staleTime: 60 * 1000,
  });

  const { data: storage } = useQuery({
    queryKey: queryKeys.storage.usage,
    queryFn: () => getStorageUsage(),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const select = (next: FilesScope) => setScope(next);

  const { mutate: create } = useMutation({
    mutationFn: (input: { name: string; color: string }) => createFolder({ data: input }),
    onSuccess: (folder) => {
      queryClient.setQueryData(queryKeys.folders.all, (old: FolderRow[] = []) => [folder, ...old]);
      toast.success(`Folder “${folder.name}” created`);
    },
    onError: (error) => toast.error(error.message),
  });

  const { mutate: rename } = useMutation({
    mutationFn: (input: { id: string; name: string }) => updateFolder({ data: input }),
    onSuccess: (folder) => {
      queryClient.setQueryData(queryKeys.folders.all, (old: FolderRow[] = []) =>
        old.map((row) => (row.id === folder.id ? { ...row, ...folder } : row)),
      );
      // Cards carry their folder's name, so the cache has copies to correct.
      patchGalleryFiles(queryClient, (file) =>
        file.folderId === folder.id && file.folder ? { ...file, folder: { id: folder.id, name: folder.name, color: folder.color } } : file,
      );
      toast.success('Folder renamed');
    },
    onError: (error) => toast.error(error.message),
  });

  const { mutate: remove } = useMutation({
    mutationFn: (id: string) => deleteFolder({ data: { id } }) as Promise<{ id: string; filesCount: number }>,
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.folders.all, (old: FolderRow[] = []) => old.filter((row) => row.id !== result.id));
      queryClient.invalidateQueries({ queryKey: queryKeys.gallery.all });
      if (scope === result.id) select('*');
      toast.success(
        result.filesCount > 0
          ? `Folder deleted · ${result.filesCount} ${result.filesCount === 1 ? 'file' : 'files'} moved out`
          : 'Folder deleted',
      );
    },
    onError: (error) => toast.error(error.message),
  });

  const usedBytes = storage?.totalBytes ?? 0;
  const quotaBytes = storage?.quotaBytes ?? 0;
  const usedRatio = quotaBytes > 0 ? Math.min(1, usedBytes / quotaBytes) : 0;

  return (
    <aside
      className={styles.root}
      aria-label="Folders"
    >
      <Row
        icon={<LayoutGrid size={16} />}
        label="All files"
        count={allFilesCount}
        active={scope === '*'}
        onSelect={() => select('*')}
      />
      <Row
        icon={<Inbox size={16} />}
        label="Not in a folder"
        count={unfiledCount}
        active={scope === null}
        onSelect={() => select(null)}
        onDropFiles={(ids) => moveFilesTo(ids, null)}
      />

      <div className={styles.sectionLabel}>
        Folders
        <button
          type="button"
          className={styles.addButton}
          aria-label="New folder"
          onClick={() => setCreating(true)}
        >
          <Plus size={14} />
        </button>
      </div>

      {creating && (
        <NewFolderField
          onCreate={(name) => {
            create({ name, color: nextFolderColor(folders.map((folder) => folder.color)) });
            setCreating(false);
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      {folders.map((folder) =>
        renamingId === folder.id ? (
          <NewFolderField
            key={folder.id}
            onCreate={(name) => {
              rename({ id: folder.id, name });
              setRenamingId(null);
            }}
            onCancel={() => setRenamingId(null)}
          />
        ) : (
          <Row
            key={folder.id}
            icon={
              <span
                className={styles.dot}
                style={{ backgroundColor: folder.color ?? FOLDER_COLOR_NONE }}
              />
            }
            label={folder.name}
            count={folder._count.files}
            active={scope === folder.id}
            onSelect={() => select(folder.id)}
            onDropFiles={(ids) => moveFilesTo(ids, folder.id)}
          >
            <DropdownMenu>
              <DropdownMenuTrigger
                className={styles.rowMenu}
                aria-label={`Actions for ${folder.name}`}
              >
                <MoreHorizontal size={14} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => setRenamingId(folder.id)}>
                  <Pencil size={14} />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setDeletingFolder(folder)}>
                  <Trash2 size={14} />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </Row>
        ),
      )}

      <div className={styles.sectionLabel}>Sharing</div>
      <div className={styles.rowWrap}>
        <button
          type="button"
          className={styles.row}
          onClick={onFormSharesOpen}
        >
          <ClipboardList size={16} />
          <span className={styles.rowName}>Form shares</span>
        </button>
      </div>

      <div className={styles.storage}>
        <div className={styles.storageRow}>
          <span>Storage</span>
          <b>
            {formatSize(usedBytes, { trim: true })} of {formatSize(quotaBytes, { trim: true })}
          </b>
        </div>
        <div
          className={styles.meter}
          role="progressbar"
          aria-label="Storage used"
          aria-valuenow={Math.round(usedRatio * 100)}
        >
          <span
            className={styles.meterFill}
            style={{ inlineSize: `${usedRatio * 100}%` }}
          />
        </div>
      </div>

      <ConfirmDeleteDialog
        open={deletingFolder !== null}
        onOpenChange={(open) => !open && setDeletingFolder(null)}
        title={deletingFolder ? `Delete “${deletingFolder.name}”?` : ''}
        description={
          deletingFolder && deletingFolder._count.files > 0
            ? `Its ${deletingFolder._count.files} ${deletingFolder._count.files === 1 ? 'file' : 'files'} move out of the folder. The files themselves are kept.`
            : 'This can’t be undone.'
        }
        onConfirm={() => {
          if (deletingFolder) remove(deletingFolder.id);
          setDeletingFolder(null);
        }}
      />
    </aside>
  );
}

export default FolderSidebar;
