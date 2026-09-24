import { Folder, FolderOpen } from 'lucide-react';
import { useTransition } from 'react';
import { ContextMenuItem, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger } from '@/components/ui/context-menu';
import { DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from '@/components/ui/dropdown-menu';
import { useFolders } from '@/contexts/FoldersContext';
import { useMoveFiles } from '@/hooks/use-move-files';
import { FOLDER_COLOR_NONE } from '@/libs/folder-colors';
import styles from './MoveToFolderMenu.module.css';

interface MoveToFolderMenuProps {
  fileIds: string[];
  onClose?: () => void;
  asDropdown?: boolean;
  /** Folders as the menu's own items rather than behind a submenu trigger. */
  flat?: boolean;
}

function MoveToFolderMenu({ fileIds, onClose, asDropdown = false, flat = false }: MoveToFolderMenuProps) {
  const [isPending, startTransition] = useTransition();
  const { folders, isLoading } = useFolders();
  const { moveFilesTo } = useMoveFiles();

  const handleMoveToFolder = (targetFolderId: string | null) => {
    startTransition(() => {
      moveFilesTo(fileIds, targetFolderId, { toggle: true, onSuccess: onClose });
    });
  };

  const [Sub, SubTrigger, SubContent, Item] = asDropdown
    ? ([DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuItem] as const)
    : ([ContextMenuSub, ContextMenuSubTrigger, ContextMenuSubContent, ContextMenuItem] as const);

  const body = isLoading ? (
    <Item disabled>Loading…</Item>
  ) : (
    <>
      <Item onClick={() => handleMoveToFolder(null)}>
        <FolderOpen className={styles.icon} />
        Not in a folder
      </Item>

      {folders.length > 0 && (
        <>
          <div className={styles.separator} />
          {folders.map((folder) => (
            <Item
              key={folder.id}
              onClick={() => handleMoveToFolder(folder.id)}
            >
              <div
                className={styles.swatch}
                style={{ backgroundColor: folder.color ?? FOLDER_COLOR_NONE }}
              />
              <span className={styles.name}>{folder.name}</span>
              <span className={styles.count}>{folder._count.files}</span>
            </Item>
          ))}
        </>
      )}

      {folders.length === 0 && <Item disabled>Create a folder first</Item>}
    </>
  );

  if (flat) return body;

  return (
    <Sub>
      <SubTrigger disabled={isPending || isLoading}>
        <Folder className={styles.icon} />
        Move to folder
      </SubTrigger>
      <SubContent className={styles.content}>{body}</SubContent>
    </Sub>
  );
}

export default MoveToFolderMenu;
