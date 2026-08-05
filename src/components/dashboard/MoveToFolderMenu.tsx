import { Folder, FolderOpen } from 'lucide-react';
import { useTransition } from 'react';
import { ContextMenuItem, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger } from '@/components/ui/context-menu';
import { DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from '@/components/ui/dropdown-menu';
import { useFolders } from '@/contexts/FoldersContext';
import { useMoveFiles } from '@/hooks/use-move-files';

interface MoveToFolderMenuProps {
  fileIds: string[];
  onClose?: () => void;
  asDropdown?: boolean;
}

function MoveToFolderMenu({ fileIds, onClose, asDropdown = false }: MoveToFolderMenuProps) {
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

  return (
    <Sub>
      <SubTrigger disabled={isPending || isLoading}>
        <Folder className="mr-2 h-4 w-4" />
        Move to folder
      </SubTrigger>
      <SubContent className="w-48">
        {isLoading ? (
          <Item disabled>Loading...</Item>
        ) : (
          <>
            {/* Root folder option */}
            <Item onClick={() => handleMoveToFolder(null)}>
              <FolderOpen className="mr-2 h-4 w-4" />
              Root (All Files)
            </Item>

            {folders.length > 0 && (
              <>
                <div className="h-px bg-border my-1" />
                {folders.map((folder) => (
                  <Item
                    key={folder.id}
                    onClick={() => handleMoveToFolder(folder.id)}
                  >
                    <div
                      className="w-4 h-4 rounded mr-2 flex-shrink-0"
                      style={{ backgroundColor: folder.color || '#6b7280' }}
                    />
                    <span className="truncate flex-1">{folder.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">{folder._count.files}</span>
                  </Item>
                ))}
              </>
            )}

            {folders.length === 0 && <Item disabled>No folders available</Item>}
          </>
        )}
      </SubContent>
    </Sub>
  );
}

export default MoveToFolderMenu;
