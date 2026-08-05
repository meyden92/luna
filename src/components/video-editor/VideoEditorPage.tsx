import { useBlocker } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { hasPendingVideoEdits, useVideoEditorStore } from '@/hooks/stores/video-editor-store';
import { extractThumbnails, revokeThumbnailUrls } from '@/libs/video-editor/ffmpeg-video';
import { BottomBar } from './BottomBar';
import { EditorToolbar } from './EditorToolbar';
import { ExportDialog } from './ExportDialog';
import { PreviewArea } from './PreviewArea';
import { ShortcutPanel } from './ShortcutPanel';
import { Timeline } from './Timeline';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { VideoDropzone } from './VideoDropzone';

export function VideoEditorPage() {
  const phase = useVideoEditorStore((s) => s.phase);
  const file = useVideoEditorStore((s) => s.file);
  const setFile = useVideoEditorStore((s) => s.setFile);
  const setPhase = useVideoEditorStore((s) => s.setPhase);
  const setThumbnails = useVideoEditorStore((s) => s.setThumbnails);
  const reset = useVideoEditorStore((s) => s.reset);

  const [exportOpen, setExportOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const loadIdRef = useRef(0);

  useEffect(
    () => () => {
      loadIdRef.current += 1;
      reset();
    },
    [reset],
  );

  const shouldBlockEditorExit = useCallback(() => {
    if (!hasPendingVideoEdits(useVideoEditorStore.getState())) return false;

    return !window.confirm('Discard your video edits and leave the editor?');
  }, []);

  useBlocker({
    shouldBlockFn: shouldBlockEditorExit,
    enableBeforeUnload: () => hasPendingVideoEdits(useVideoEditorStore.getState()),
  });

  const handleSave = useCallback(() => {
    if (useVideoEditorStore.getState().phase === 'ready') setExportOpen(true);
  }, []);

  useKeyboardShortcuts({
    onSave: handleSave,
    onToggleHelp: () => setHelpOpen((v) => !v),
  });

  const handleFileSelect = useCallback(
    async (selected: File) => {
      const loadId = loadIdRef.current + 1;
      loadIdRef.current = loadId;
      const isCurrentLoad = () => loadIdRef.current === loadId;

      setPhase('loading');
      const url = URL.createObjectURL(selected);

      const video = document.createElement('video');
      video.src = url;
      video.preload = 'metadata';

      const metadata = await new Promise<{ duration: number; width: number; height: number } | null>((resolve) => {
        video.onloadedmetadata = () => {
          resolve({
            duration: video.duration,
            width: video.videoWidth,
            height: video.videoHeight,
          });
        };
        video.onerror = () => resolve(null);
      });

      if (!isCurrentLoad()) {
        URL.revokeObjectURL(url);
        return;
      }

      if (!metadata || !Number.isFinite(metadata.duration) || metadata.duration <= 0) {
        URL.revokeObjectURL(url);
        setPhase('error', 'Unable to read video metadata.');
        toast.error('Could not read this video. Try a different file.');
        return;
      }

      setFile(selected, url, metadata.duration, metadata.width, metadata.height);

      try {
        const count = Math.max(20, Math.min(80, Math.round(metadata.duration * 2)));
        const thumbs = await extractThumbnails(selected, metadata.duration, { count });
        if (isCurrentLoad() && useVideoEditorStore.getState().file === selected) {
          setThumbnails(thumbs);
        } else {
          revokeThumbnailUrls(thumbs);
        }
      } catch {
        // Thumbnails are a nice-to-have; silent fail
      }
    },
    [setFile, setPhase, setThumbnails],
  );

  if (phase === 'idle' || phase === 'error' || !file) {
    return (
      <div className="h-full w-full flex flex-col">
        <VideoDropzone
          onFileSelect={handleFileSelect}
          disabled={phase === 'loading'}
        />
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col bg-gradient-to-b from-[#0b2341] to-[#0a1b30] text-foreground overflow-hidden relative">
      <EditorToolbar />
      <div className="relative flex-1 min-h-0 flex">
        <ShortcutPanel
          open={helpOpen}
          onToggle={() => setHelpOpen((v) => !v)}
        />
        <PreviewArea />
      </div>
      <Timeline />
      <BottomBar onSave={handleSave} />
      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
      />
    </div>
  );
}
