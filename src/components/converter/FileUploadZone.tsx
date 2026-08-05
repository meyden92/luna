import { UploadIcon } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/libs/utils';
import { SUPPORTED_VIDEO_FORMATS } from '@/types/converter';

interface FileUploadZoneProps {
  onFileSelect: (file: File, format: string) => void;
  isLoading?: boolean;
}

export function FileUploadZone({ onFileSelect, isLoading = false }: FileUploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const validateAndSelectFile = useCallback(
    (file: File) => {
      // Check MIME type
      if (!file.type.startsWith('video/')) {
        toast.error('Please upload a video file');
        return;
      }

      // Check file extension
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!ext || !SUPPORTED_VIDEO_FORMATS.includes(ext)) {
        toast.error(`Unsupported format. Supported: ${SUPPORTED_VIDEO_FORMATS.join(', ')}`);
        return;
      }

      // Warn about large files
      const sizeMB = file.size / (1024 * 1024);
      if (sizeMB > 100) {
        toast.warning(`Large file detected (${sizeMB.toFixed(1)} MB). Conversion may take several minutes.`);
      }

      onFileSelect(file, ext);
    },
    [onFileSelect],
  );

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const firstFile = fileArray[0];
      if (firstFile) {
        validateAndSelectFile(firstFile);
      }
    },
    [validateAndSelectFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFiles(e.target.files);
      }
    },
    [handleFiles],
  );

  return (
    <div
      className={cn(
        'relative border-2 border-dashed rounded-lg transition-colors',
        isDragOver ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50',
        isLoading && 'opacity-50 pointer-events-none',
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <label className="flex flex-col items-center justify-center gap-3 p-12 cursor-pointer">
        <UploadIcon className={cn('size-12', isDragOver ? 'text-primary' : 'text-muted-foreground')} />
        <div className="text-center">
          <p className="text-sm font-medium">Drop video files here or click to browse</p>
          <p className="text-xs text-muted-foreground mt-2">MP4, WebM, MKV, AVI, MOV and more</p>
        </div>
        <input
          type="file"
          accept="video/*"
          className="sr-only"
          onChange={handleInputChange}
          disabled={isLoading}
        />
      </label>
    </div>
  );
}
