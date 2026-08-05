import { FilmIcon } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/libs/utils';

interface VideoDropzoneProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
}

const MAX_WARN_MB = 500;

export function VideoDropzone({ onFileSelect, disabled = false }: VideoDropzoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const validate = useCallback(
    (file: File) => {
      if (!file.type.startsWith('video/')) {
        toast.error('Please drop a video file');
        return;
      }
      const sizeMB = file.size / (1024 * 1024);
      if (sizeMB > MAX_WARN_MB) {
        toast.warning(`Large file (${sizeMB.toFixed(0)} MB). Editing runs in your browser and may be slow or run out of memory.`);
      }
      onFileSelect(file);
    },
    [onFileSelect],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) validate(file);
    },
    [validate],
  );

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) validate(file);
    },
    [validate],
  );

  return (
    <div className="h-full w-full flex items-center justify-center p-6">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'w-full max-w-2xl border-2 border-dashed rounded-lg transition-colors',
          isDragOver ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50',
          disabled && 'opacity-50 pointer-events-none',
        )}
      >
        <label className="flex flex-col items-center justify-center gap-3 p-12 cursor-pointer">
          <FilmIcon className={cn('size-12', isDragOver ? 'text-primary' : 'text-muted-foreground')} />
          <div className="text-center">
            <p className="text-sm font-medium">Drop a video here or click to browse</p>
            <p className="text-xs text-muted-foreground mt-2">MP4, WebM, MOV, MKV — edits run entirely in your browser</p>
          </div>
          <input
            type="file"
            accept="video/*"
            className="sr-only"
            onChange={handleInput}
            disabled={disabled}
          />
        </label>
      </div>
    </div>
  );
}
