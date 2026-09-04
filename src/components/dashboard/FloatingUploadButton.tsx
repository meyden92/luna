import { FileText, Upload } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FormBuilderDialog } from '@/components/form-share/FormBuilderDialog';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { FilesList } from '@/components/uploader/FilesList';
import { UploadProgress } from '@/components/uploader/UploadProgress';
import { useFileUpload } from '@/components/uploader/useFileUpload';
import { formatSize } from '@/libs/utils';
import { Input } from '../ui/input';
import styles from './FloatingUploadButton.module.css';

const UPLOAD_ACCEPT =
  'image/*,video/*,audio/*,text/*,application/gzip,application/json,application/pdf,application/x-7z-compressed,application/x-rar-compressed,application/x-tar,application/x-zip-compressed,application/xml,application/zip,.7z,.gz,.json,.pdf,.rar,.tar,.xml,.zip,.doc,.docx,.ppt,.pptx,.xls,.xlsx';

interface FloatingUploadButtonProps {
  isFormBuilderOpen: boolean;
  onFormBuilderOpenChange: (open: boolean) => void;
  onDragStateChange?: (isDragging: boolean) => void;
  uploadRef?: React.RefObject<UploadHandle | null>;
  showFloatingTrigger?: boolean;
}

export interface UploadHandle {
  addFiles: (files: File[]) => void;
  openSheet: () => void;
}

export function FloatingUploadButton({
  isFormBuilderOpen,
  onFormBuilderOpenChange,
  onDragStateChange,
  uploadRef,
  showFloatingTrigger = true,
}: FloatingUploadButtonProps) {
  const {
    files,
    isUploading,
    uploadProgress,
    uploadError,
    failedUploadFiles,
    addFiles,
    removeFile,
    retryFile,
    handleUpload,
    resetUploadState,
    clearSuccessfulUploads,
  } = useFileUpload();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const totalUploadBytes = files.reduce((sum, fileStatus) => sum + fileStatus.file.size, 0);

  // Expose addFiles and openSheet to parent via ref
  useEffect(() => {
    if (uploadRef && 'current' in uploadRef) {
      uploadRef.current = {
        addFiles,
        openSheet: () => setIsSidebarOpen(true),
      };
    }
  }, [addFiles, uploadRef]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      addFiles(Array.from(event.target.files));
    }
    // Reset input so the same file(s) can be re-selected
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      onDragStateChange?.(false);
      const droppedFiles = e.dataTransfer.files;
      if (droppedFiles.length > 0) {
        addFiles(Array.from(droppedFiles));
      }
    },
    [addFiles, onDragStateChange],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(true);
      onDragStateChange?.(true);
    },
    [onDragStateChange],
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      onDragStateChange?.(false);
    },
    [onDragStateChange],
  );

  const handleUploadComplete = () => {
    resetUploadState();
    clearSuccessfulUploads();
  };

  const handleUploadProgressOpenChange = (open: boolean) => {
    if (isUploading) return;
    if (!open) handleUploadComplete();
  };

  const handleUploadButtonClick = () => {
    if (isUploading) return;
    setIsSidebarOpen(false);
    handleUpload();
  };

  return (
    <>
      <Input
        type="file"
        className={styles.fileInput}
        accept={UPLOAD_ACCEPT}
        multiple
        onChange={handleFileChange}
        ref={fileInputRef}
      />

      {showFloatingTrigger ? (
        <Button
          onClick={() => setIsSidebarOpen(true)}
          size="icon"
          className={styles.trigger}
          aria-label="Upload files"
        >
          <Upload className={styles.icon} />
        </Button>
      ) : null}

      <Sheet
        open={isSidebarOpen}
        onOpenChange={setIsSidebarOpen}
      >
        <SheetContent
          side="right"
          className={styles.sheet}
        >
          <SheetHeader>
            <SheetTitle>{`Files (${files.length})${files.length > 0 ? ` · ${formatSize(totalUploadBytes, { precision: 1, trim: true })}` : ''}`}</SheetTitle>
          </SheetHeader>

          <div className={styles.body}>
            <Button
              variant="outline"
              className={styles.formShare}
              onClick={() => {
                setIsSidebarOpen(false);
                onFormBuilderOpenChange(true);
              }}
            >
              <FileText className={styles.icon} />
              Share Form Data
            </Button>

            <div
              className={styles.dropzone}
              data-dragging={isDragging || undefined}
              role="button"
              tabIndex={0}
              aria-label="Upload files"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
            >
              <div className={styles.dropzoneInner}>
                <div className={styles.dropzoneGlyph}>
                  <Upload className={styles.dropzoneIcon} />
                </div>
                <div className={styles.dropzoneTitle}>{isDragging ? 'Drop files here' : 'Drag & drop files here or click to browse'}</div>
                <p className={styles.dropzoneHint}>Images, video, audio, text, PDFs, Office docs, and archives up to 200 MB.</p>
              </div>
            </div>

            {files.length > 0 && (
              <>
                <div className={styles.list}>
                  <FilesList
                    files={files}
                    onRemoveAction={removeFile}
                    onRetryAction={retryFile}
                  />
                </div>

                <Button
                  onClick={handleUploadButtonClick}
                  className={styles.submit}
                  disabled={isUploading}
                >
                  Start Upload
                </Button>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <UploadProgress
        isOpen={isUploading || Boolean(uploadError)}
        onOpenChangeAction={handleUploadProgressOpenChange}
        isUploading={isUploading}
        progress={uploadProgress}
        error={uploadError}
        failedFiles={failedUploadFiles}
        onCloseAction={handleUploadComplete}
      />

      <FormBuilderDialog
        open={isFormBuilderOpen}
        onOpenChange={onFormBuilderOpenChange}
      />
    </>
  );
}
