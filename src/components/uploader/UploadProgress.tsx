import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import styles from './UploadProgress.module.css';

interface UploadProgressProps {
  isOpen: boolean;
  onOpenChangeAction: (open: boolean) => void;
  isUploading: boolean;
  progress: number;
  error: string | null;
  failedFiles: Array<{ id: string; name: string; error?: string }>;
  onCloseAction: () => void;
}

export const UploadProgress = ({
  isOpen,
  onOpenChangeAction,
  isUploading,
  progress,
  error,
  failedFiles,
  onCloseAction,
}: UploadProgressProps) => {
  const hasFailedFiles = failedFiles.length > 0;
  const displayedProgress = error ? progress : isUploading ? Math.min(progress, 99) : progress;
  const dialogTitle = error && hasFailedFiles ? 'Upload Completed with Errors' : error ? 'Upload Error' : 'Uploading Files';
  const handleOpenChange = (open: boolean) => {
    if (!open && isUploading) return;
    onOpenChangeAction(open);
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={handleOpenChange}
    >
      <DialogContent
        className={styles.dialog}
        showCloseButton={!isUploading}
      >
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>
        <div className={styles.body}>
          {(!error || hasFailedFiles) && (
            <>
              <Progress
                value={displayedProgress}
                className={styles.bar}
              />
              {hasFailedFiles ? (
                <p className={styles.failedCount}>
                  {failedFiles.length} {failedFiles.length === 1 ? 'file' : 'files'} failed to upload.
                </p>
              ) : (
                <p className={styles.percent}>{displayedProgress.toFixed(0)}% Complete</p>
              )}
            </>
          )}

          {error && !hasFailedFiles && (
            <Alert
              variant="destructive"
              className={styles.alert}
            >
              <AlertCircle className={styles.alertIcon} />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription className={styles.errorText}>{error}</AlertDescription>
            </Alert>
          )}

          {hasFailedFiles && (
            <Alert
              variant="destructive"
              className={styles.alert}
            >
              <AlertCircle className={styles.alertIcon} />
              <AlertTitle>Failed uploads</AlertTitle>
              <AlertDescription>
                {error && <p className={styles.errorText}>{error}</p>}
                <ul className={styles.failedList}>
                  {failedFiles.map((file) => (
                    <li
                      key={file.id}
                      className={styles.failedItem}
                    >
                      <span className={styles.failedName}>{file.name}</span>
                      {file.error ? <span>: {file.error}</span> : null}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </div>
        <DialogFooter>
          <Button
            onClick={onCloseAction}
            disabled={isUploading || (!error && progress < 100)}
          >
            {error ? 'Close' : 'Done'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
