import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';

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
        className="sm:max-w-[425px]"
        showCloseButton={!isUploading}
      >
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>
        <div className="mt-4">
          {(!error || hasFailedFiles) && (
            <>
              <Progress
                value={displayedProgress}
                className="w-full"
              />
              {hasFailedFiles ? (
                <p className="mt-2 text-center text-sm text-destructive">
                  {failedFiles.length} {failedFiles.length === 1 ? 'file' : 'files'} failed to upload.
                </p>
              ) : (
                <p className="mt-2 text-center">{displayedProgress.toFixed(0)}% Complete</p>
              )}
            </>
          )}

          {error && !hasFailedFiles && (
            <Alert
              variant="destructive"
              className="mt-4"
            >
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription className="whitespace-pre-wrap break-all">{error}</AlertDescription>
            </Alert>
          )}

          {hasFailedFiles && (
            <Alert
              variant="destructive"
              className="mt-4"
            >
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Failed uploads</AlertTitle>
              <AlertDescription className="space-y-2">
                {error && <p className="whitespace-pre-wrap break-all">{error}</p>}
                <ul className="space-y-1">
                  {failedFiles.map((file) => (
                    <li
                      key={file.id}
                      className="break-all"
                    >
                      <span className="font-medium">{file.name}</span>
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
