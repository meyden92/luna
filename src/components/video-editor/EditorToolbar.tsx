import { CropIcon, RotateCcwIcon, ScissorsIcon, SlashIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { hasPendingVideoEdits, useVideoEditorStore } from '@/hooks/stores/video-editor-store';
import { formatTime } from '@/libs/video-editor/ffmpeg-video';
import styles from './EditorToolbar.module.css';

export function EditorToolbar() {
  const [discardOpen, setDiscardOpen] = useState(false);
  const mode = useVideoEditorStore((s) => s.mode);
  const setMode = useVideoEditorStore((s) => s.setMode);
  const resetEdits = useVideoEditorStore((s) => s.resetEdits);
  const reset = useVideoEditorStore((s) => s.reset);
  const hasEdits = useVideoEditorStore(hasPendingVideoEdits);
  const fileName = useVideoEditorStore((s) => s.file?.name);
  const duration = useVideoEditorStore((s) => s.duration);
  const videoWidth = useVideoEditorStore((s) => s.videoWidth);
  const videoHeight = useVideoEditorStore((s) => s.videoHeight);

  const handleClose = () => {
    if (hasEdits) {
      setDiscardOpen(true);
      return;
    }

    reset();
  };

  return (
    <>
      <div className={styles.root}>
        <ModeButton
          icon={<ScissorsIcon />}
          label="Trim"
          shortcut="1"
          active={mode === 'trim'}
          onClick={() => setMode('trim')}
        />
        <ModeButton
          icon={<SlashIcon />}
          label="Cut"
          shortcut="2"
          active={mode === 'cut'}
          onClick={() => setMode('cut')}
        />
        <ModeButton
          icon={<CropIcon />}
          label="Crop"
          shortcut="3"
          active={mode === 'crop'}
          onClick={() => setMode('crop')}
        />

        <div className={styles.fileInfo}>
          {fileName && <span>{fileName}</span>}
          {duration > 0 && (
            <span className={styles.dimensions}>
              {formatTime(duration)} · {videoWidth}×{videoHeight}
            </span>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={resetEdits}
          title="Reset all edits"
        >
          <RotateCcwIcon className={styles.icon} />
          Reset
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleClose}
          aria-label="Close editor"
          title="Close editor"
        >
          <XIcon className={styles.icon} />
        </Button>
      </div>

      <AlertDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard your edits?</AlertDialogTitle>
            <AlertDialogDescription>
              Closing the editor will discard your trims, cuts, and crop settings. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={reset}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ModeButton({
  icon,
  label,
  shortcut,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={styles.mode}
      data-active={active}
    >
      {icon}
      {label}
      {shortcut && <span className={styles.modeKey}>{shortcut}</span>}
    </button>
  );
}
