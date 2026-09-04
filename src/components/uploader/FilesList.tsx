import { FileItem } from './FileItem';
import styles from './FilesList.module.css';
import type { FileStatus } from './useFileUpload';

interface FilesListProps {
  files: FileStatus[];
  onRemoveAction: (id: string) => void;
  onRetryAction: (id: string) => void;
}

export const FilesList = ({ files, onRemoveAction, onRetryAction }: FilesListProps) => {
  if (files.length === 0) {
    return <div className={styles.empty}>No files selected</div>;
  }

  return (
    <div className={styles.list}>
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
