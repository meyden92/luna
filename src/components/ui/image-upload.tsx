import { Upload, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UPLOAD_CONFIG } from '@/config/upload-config';
import { cn } from '@/libs/utils';

interface ImageUploadProps {
  value?: File | null;
  onChange: (file: File | null) => void;
  previewUrl?: string | null;
  onRemove?: () => void;
  className?: string;
  disabled?: boolean;
  label?: string;
}

export function ImageUpload({
  onChange,
  previewUrl,
  onRemove,
  className,
  disabled = false,
  label = 'Upload Image',
  value,
}: ImageUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [internalPreview, setInternalPreview] = useState<string | null>(null);

  // Handle internal preview for File objects
  useEffect(() => {
    if (value instanceof File) {
      const url = URL.createObjectURL(value);
      setInternalPreview(url);
      return () => URL.revokeObjectURL(url);
    }
    setInternalPreview(null);
    return undefined;
  }, [value]);

  const displayUrl = previewUrl || internalPreview;

  const validateFile = useCallback((file: File): boolean => {
    if (file.size > UPLOAD_CONFIG.MAX_FILE_SIZE) {
      toast.error(`File ${file.name} is too large. Maximum size is ${UPLOAD_CONFIG.MAX_FILE_SIZE / (1024 * 1024)}MB.`);
      return false;
    }
    // Type assertion since we know the config values are valid strings
    if (!UPLOAD_CONFIG.ALLOWED_IMAGE_TYPES.includes(file.type as any)) {
      toast.error(
        `File ${file.name} has an unsupported format. Allowed: ${UPLOAD_CONFIG.ALLOWED_IMAGE_TYPES.map((t) => t.split('/')[1]).join(', ')}.`,
      );
      return false;
    }
    return true;
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && validateFile(file)) {
      onChange(file);
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;

      const file = e.dataTransfer.files?.[0];
      if (file && validateFile(file)) {
        onChange(file);
      }
    },
    [onChange, disabled, validateFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleRemove = () => {
    onChange(null);
    onRemove?.();
  };

  return (
    <div className={cn('space-y-2', className)}>
      {displayUrl ? (
        <div className="relative inline-block group">
          <img
            src={displayUrl}
            alt="Preview"
            className="w-32 h-32 object-cover rounded-lg border shadow-sm transition-opacity group-hover:opacity-90"
          />
          {!disabled && (
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="absolute -top-2 -right-2 h-6 w-6 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={handleRemove}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      ) : (
        <div
          className={cn(
            'relative border-2 border-dashed rounded-lg p-6 transition-colors text-center cursor-pointer hover:bg-muted/50',
            isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25',
            disabled && 'opacity-50 cursor-not-allowed hover:bg-transparent',
          )}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => !disabled && document.getElementById('image-upload-input')?.click()}
        >
          <Input
            id="image-upload-input"
            type="file"
            accept={UPLOAD_CONFIG.ALLOWED_IMAGE_TYPES.join(',')}
            onChange={handleFileChange}
            className="hidden"
            disabled={disabled}
          />
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <div className="p-2 bg-background rounded-full shadow-sm border">
              <Upload className="h-5 w-5" />
            </div>
            <div className="text-sm font-medium">{label}</div>
            <div className="text-xs">Drag & drop or click to upload</div>
            <div className="text-[10px] uppercase tracking-wider opacity-70">Max {UPLOAD_CONFIG.MAX_FILE_SIZE / (1024 * 1024)}MB</div>
          </div>
        </div>
      )}
    </div>
  );
}
