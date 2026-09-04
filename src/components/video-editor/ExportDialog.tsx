import { CheckCircle2Icon, DownloadIcon, Loader2Icon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { useVideoEditorStore } from '@/hooks/stores/video-editor-store';
import { downloadBlob, exportVideo } from '@/libs/video-editor/ffmpeg-video';
import styles from './ExportDialog.module.css';

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Status = 'preparing' | 'exporting' | 'done' | 'error';

export function ExportDialog({ open, onOpenChange }: ExportDialogProps) {
  const [status, setStatus] = useState<Status>('preparing');
  const [progress, setProgress] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  const file = useVideoEditorStore((s) => s.file);
  const trimStart = useVideoEditorStore((s) => s.trimStart);
  const trimEnd = useVideoEditorStore((s) => s.trimEnd);
  const cuts = useVideoEditorStore((s) => s.cuts);
  const crop = useVideoEditorStore((s) => s.crop);
  const videoWidth = useVideoEditorStore((s) => s.videoWidth);
  const videoHeight = useVideoEditorStore((s) => s.videoHeight);

  useEffect(() => {
    if (!open || !file) return;
    if (startedRef.current) return;
    startedRef.current = true;

    setStatus('preparing');
    setProgress(0);
    setBlob(null);
    setError(null);

    const cropApplied = crop.x !== 0 || crop.y !== 0 || crop.w !== 1 || crop.h !== 1;

    exportVideo({
      file,
      trimStart,
      trimEnd,
      cuts,
      crop: cropApplied ? crop : null,
      videoWidth,
      videoHeight,
      onProgress: (p) => {
        setStatus('exporting');
        setProgress(p);
      },
    })
      .then((result) => {
        setBlob(result);
        setStatus('done');
        setProgress(100);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Export failed.';
        setError(msg);
        setStatus('error');
        toast.error(msg);
      });
  }, [open, file, trimStart, trimEnd, cuts, crop, videoWidth, videoHeight]);

  useEffect(() => {
    if (!open) {
      startedRef.current = false;
    }
  }, [open]);

  const handleDownload = () => {
    if (!blob || !file) return;
    const base = file.name.replace(/\.[^.]+$/, '');
    downloadBlob(blob, `${base}-edited.mp4`);
  };

  const handleClose = () => {
    if (status === 'exporting' || status === 'preparing') return;
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={handleClose}
    >
      <DialogContent showCloseButton={status === 'done' || status === 'error'}>
        <DialogHeader>
          <DialogTitle>{status === 'done' ? 'Export complete' : status === 'error' ? 'Export failed' : 'Exporting video'}</DialogTitle>
          <DialogDescription>
            {status === 'done'
              ? 'Your edited video is ready to download.'
              : status === 'error'
                ? (error ?? 'Something went wrong while exporting.')
                : 'Processing in your browser. This may take a moment for longer clips.'}
          </DialogDescription>
        </DialogHeader>

        {(status === 'preparing' || status === 'exporting') && (
          <div className={styles.progress}>
            <div className={styles.status}>
              <Loader2Icon className={styles.spinner} />
              <span>{status === 'preparing' ? 'Loading FFmpeg (first run downloads ~30 MB)…' : `Encoding… ${progress}%`}</span>
            </div>
            <Progress
              value={progress}
              className={styles.bar}
            />
          </div>
        )}

        {status === 'done' && blob && (
          <div className={styles.done}>
            <CheckCircle2Icon className={styles.doneIcon} />
            <p className={styles.fileMeta}>{(blob.size / (1024 * 1024)).toFixed(1)} MB · MP4</p>
            <Button
              onClick={handleDownload}
              className={styles.fullWidth}
            >
              <DownloadIcon className={styles.icon} />
              Download
            </Button>
          </div>
        )}

        {status === 'error' && (
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className={styles.fullWidth}
          >
            Close
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
