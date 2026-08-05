import { FileIcon, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatSize } from '@/libs/utils';
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
      className="flex items-center space-x-4"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
        {isImage(fileStatus.file) && !imageError && previewUrl ? (
          <img
            src={previewUrl}
            alt={fileStatus.file.name}
            className="object-cover w-auto h-auto max-w-full max-h-full"
            onError={() => setImageError(true)}
          />
        ) : (
          <FileIcon className="h-6 w-6 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{fileStatus.file.name}</p>
        <p className="text-sm text-muted-foreground">{formatSize(fileStatus.file.size, { precision: 1, trim: true })}</p>
        {fileStatus.status === 'error' && <p className="truncate text-xs text-destructive">{fileStatus.error || 'Upload failed'}</p>}
      </div>
      <div className="flex shrink-0 space-x-2">
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
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
