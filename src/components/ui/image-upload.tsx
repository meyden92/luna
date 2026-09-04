import { Upload, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UPLOAD_CONFIG } from '@/config/upload-config';
import { cn } from '@/libs/utils';

import styles from './image-upload.module.css';

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
    <div className={cn(styles.root, className)}>
      {displayUrl ? (
        <div className={styles.previewWrap}>
          <img
            src={displayUrl}
            alt="Preview"
            className={styles.previewImage}
          />
          {!disabled && (
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className={styles.removeButton}
              onClick={handleRemove}
            >
              <X className={styles.removeIcon} />
            </Button>
          )}
        </div>
      ) : (
        <div
          className={styles.dropzone}
          data-dragging={isDragging}
          data-disabled={disabled}
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
            className="hide"
            disabled={disabled}
          />
          <div className={styles.dropzoneContent}>
            <div className={styles.iconWrap}>
              <Upload className={styles.uploadIcon} />
            </div>
            <div className="type-sm weight-medium">{label}</div>
            <div className="type-xs">Drag & drop or click to upload</div>
            <div className={cn(styles.maxSize, 'type-xs')}>Max {UPLOAD_CONFIG.MAX_FILE_SIZE / (1024 * 1024)}MB</div>
          </div>
        </div>
      )}
    </div>
  );
}
