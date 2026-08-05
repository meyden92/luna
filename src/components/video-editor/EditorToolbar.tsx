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
import { cn } from '@/libs/utils';
import { formatTime } from '@/libs/video-editor/ffmpeg-video';

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
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border/50">
        <ModeButton
          icon={<ScissorsIcon className="size-4" />}
          label="Trim"
          shortcut="1"
          active={mode === 'trim'}
          onClick={() => setMode('trim')}
        />
        <ModeButton
          icon={<SlashIcon className="size-4" />}
          label="Cut"
          shortcut="2"
          active={mode === 'cut'}
          onClick={() => setMode('cut')}
        />
        <ModeButton
          icon={<CropIcon className="size-4" />}
          label="Crop"
          shortcut="3"
          active={mode === 'crop'}
          onClick={() => setMode('crop')}
        />

        <div className="flex-1 text-center text-xs text-muted-foreground truncate px-4">
          {fileName && <span className="truncate">{fileName}</span>}
          {duration > 0 && (
            <span className="ml-3 font-mono text-[11px] opacity-80">
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
          <RotateCcwIcon className="size-4" />
          Reset
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleClose}
          aria-label="Close editor"
          title="Close editor"
        >
          <XIcon className="size-4" />
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
      className={cn(
        'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors border',
        active
          ? 'bg-primary/15 text-primary border-primary/40'
          : 'text-muted-foreground hover:text-foreground border-transparent hover:border-border/60 hover:bg-accent/50',
      )}
    >
      {icon}
      {label}
      {shortcut && (
        <span
          className={cn(
            'ml-1 rounded border px-1 font-mono text-[10px] leading-tight',
            active ? 'border-primary/40 text-primary/70' : 'border-border/60 text-muted-foreground/70',
          )}
        >
          {shortcut}
        </span>
      )}
    </button>
  );
}
