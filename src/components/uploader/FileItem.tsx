import { FileIcon, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatSize } from '@/libs/utils';
import styles from './FileItem.module.css';
import type { FileStatus } from './useFileUpload';

interface FileItemProps {
  fileStatus: FileStatus;
  onRemoveAction: (id: string) => void;
  onRetryAction: (id: string) => void;
}

export const FileItem = ({ fileStatus, onRemoveAction, onRetryAction }: FileItemProps) => {
  const [imageError, setImageError] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!fileStatus.file.type.startsWith('image/')) {
      return;
    }
    const url = URL.createObjectURL(fileStatus.file);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [fileStatus.file]);

  const isImage = (file: File) => {
    return file.type.startsWith('image/');
  };

  return (
    <div
      key={fileStatus.id}
      className={styles.root}
    >
      <div className={styles.thumb}>
        {isImage(fileStatus.file) && !imageError && previewUrl ? (
          <img
            src={previewUrl}
            alt={fileStatus.file.name}
            className={styles.preview}
            onError={() => setImageError(true)}
          />
        ) : (
          <FileIcon className={styles.fallbackIcon} />
        )}
      </div>
      <div className={styles.meta}>
        <p className={styles.name}>{fileStatus.file.name}</p>
        <p className={styles.size}>{formatSize(fileStatus.file.size, { precision: 1, trim: true })}</p>
        {fileStatus.status === 'error' && <p className={styles.error}>{fileStatus.error || 'Upload failed'}</p>}
      </div>
      <div className={styles.actions}>
        {fileStatus.status === 'error' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onRetryAction(fileStatus.id)}
          >
            Retry
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onRemoveAction(fileStatus.id)}
        >
          <X className={styles.removeIcon} />
        </Button>
      </div>
    </div>
  );
};
