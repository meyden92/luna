import { DownloadIcon, Loader2Icon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getTotalAudioDuration, useAudioEditorStore } from '@/hooks/stores/audio-editor-store';
import { downloadBlob, encodeMP3, encodeWAV } from '@/libs/audio-editor/audio-encoder';
import { formatTimeShort } from '@/libs/audio-editor/audio-utils';
import { useAudioEditor } from '../AudioEditorProvider';
import styles from './ExportDialog.module.css';

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ExportFormat = 'mp3' | 'wav';
type MP3Bitrate = 128 | 192 | 256 | 320;

export function ExportDialog({ open, onOpenChange }: ExportDialogProps) {
  const { renderOffline } = useAudioEditor();
  const duration = useAudioEditorStore((state) => getTotalAudioDuration(state.clips));
  const isExporting = useAudioEditorStore((state) => state.isExporting);
  const setIsExporting = useAudioEditorStore((state) => state.setIsExporting);
  const setExportProgress = useAudioEditorStore((state) => state.setExportProgress);
  const exportProgress = useAudioEditorStore((state) => state.exportProgress);

  const [format, setFormat] = useState<ExportFormat>('mp3');
  const [bitrate, setBitrate] = useState<MP3Bitrate>(192);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setError(null);
    setIsExporting(true);
    setExportProgress(0);

    try {
      // Render audio
      setExportProgress(10);
      const renderedBuffer = await renderOffline((progress) => {
        setExportProgress(10 + progress * 0.5);
      });

      // Encode to selected format
      setExportProgress(60);
      let blob: Blob;
      let filename: string;

      if (format === 'mp3') {
        blob = await encodeMP3(renderedBuffer, bitrate);
        filename = `audio-export-${Date.now()}.mp3`;
      } else {
        blob = encodeWAV(renderedBuffer);
        filename = `audio-export-${Date.now()}.wav`;
      }

      setExportProgress(90);

      // Download
      downloadBlob(blob, filename);

      setExportProgress(100);

      // Close dialog after short delay
      setTimeout(() => {
        onOpenChange(false);
        setExportProgress(0);
      }, 500);
    } catch (err) {
      console.error('Export failed:', err);
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export Audio</DialogTitle>
          <DialogDescription>Export your project as an audio file. Duration: {formatTimeShort(duration)}</DialogDescription>
        </DialogHeader>

        <div className={styles.fields}>
          {/* Format selection */}
          <div className={styles.field}>
            <Label className={styles.fieldLabel}>Format</Label>
            <Select
              value={format}
              onValueChange={(value) => setFormat(value as ExportFormat)}
              disabled={isExporting}
            >
              <SelectTrigger className={styles.fieldControl}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mp3">MP3 (compressed)</SelectItem>
                <SelectItem value="wav">WAV (lossless)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Bitrate (MP3 only) */}
          {format === 'mp3' && (
            <div className={styles.field}>
              <Label className={styles.fieldLabel}>Quality</Label>
              <Select
                value={bitrate.toString()}
                onValueChange={(value) => setBitrate(Number(value) as MP3Bitrate)}
                disabled={isExporting}
              >
                <SelectTrigger className={styles.fieldControl}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="128">128 kbps (smaller file)</SelectItem>
                  <SelectItem value="192">192 kbps (balanced)</SelectItem>
                  <SelectItem value="256">256 kbps (high quality)</SelectItem>
                  <SelectItem value="320">320 kbps (best quality)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Progress */}
          {isExporting && (
            <div className={styles.progress}>
              <div className={styles.progressRow}>
                <span className={styles.progressLabel}>Exporting...</span>
                <span>{Math.round(exportProgress)}%</span>
              </div>
              <Progress value={exportProgress} />
            </div>
          )}

          {/* Error */}
          {error && <div className={styles.error}>{error}</div>}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isExporting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            disabled={isExporting || duration === 0}
          >
            {isExporting ? (
              <>
                <Loader2Icon className={styles.spinner} />
                Exporting...
              </>
            ) : (
              <>
                <DownloadIcon className={styles.icon} />
                Export
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
