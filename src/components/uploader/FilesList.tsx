import { FileItem } from './FileItem';
import type { FileStatus } from './useFileUpload';

interface FilesListProps {
  files: FileStatus[];
  onRemoveAction: (id: string) => void;
  onRetryAction: (id: string) => void;
}

export const FilesList = ({ files, onRemoveAction, onRetryAction }: FilesListProps) => {
  if (files.length === 0) {
    return <div className="py-8 text-center text-muted-foreground">No files selected</div>;
  }

  return (
    <div className="mt-4 max-h-[calc(100vh-200px)] space-y-4 overflow-y-auto">
      {files.map((fileStatus) => (
        <FileItem
          key={fileStatus.id}
          fileStatus={fileStatus}
          onRemoveAction={onRemoveAction}
          onRetryAction={onRetryAction}
        />
      ))}
    </div>
  );
};
