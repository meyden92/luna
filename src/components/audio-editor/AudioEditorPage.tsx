import { useBlocker } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { ShortcutPanel } from '@/components/video-editor/ShortcutPanel';
import { hasPendingAudioEdits, useAudioEditorStore } from '@/hooks/stores/audio-editor-store';
import { AudioEditorProvider, useAudioEditor } from './AudioEditorProvider';
import { AudioEditorDndProvider } from './DndProvider';
import { MediaPool } from './MediaPool/MediaPool';
import { Timeline } from './Timeline/Timeline';
import { ClipTools } from './Toolbar/ClipTools';
import { EditorToolbar } from './Toolbar/EditorToolbar';
import { TrackList } from './Tracks/TrackList';

const AUDIO_EDITOR_SHORTCUTS: Array<[string, string]> = [
  ['Space', 'Play · Pause'],
  ['C', 'Split selected clip'],
  ['Del', 'Delete selected clip'],
  ['?', 'Toggle this panel'],
];

function AudioEditorContent() {
  const reset = useAudioEditorStore((state) => state.reset);
  const { playTimeline, stopPlayback } = useAudioEditor();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const shouldBlockEditorExit = useCallback(() => {
    if (!hasPendingAudioEdits(useAudioEditorStore.getState())) return false;

    return !window.confirm('Discard your audio edits and leave the editor?');
  }, []);

  useBlocker({
    shouldBlockFn: shouldBlockEditorExit,
    enableBeforeUnload: () => hasPendingAudioEdits(useAudioEditorStore.getState()),
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // '?' key - toggle shortcut panel
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setShortcutsOpen((open) => !open);
      }

      // Spacebar - toggle play/pause
      if (e.code === 'Space') {
        e.preventDefault();
        if (useAudioEditorStore.getState().isPlaying) {
          stopPlayback();
        } else {
          playTimeline();
        }
      }

      // 'C' key - split selected clips at playhead
      if (e.code === 'KeyC' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const { selectedClipIds, clips, currentTime, splitClip } = useAudioEditorStore.getState();
        for (const clipId of selectedClipIds) {
          const clip = clips[clipId];
          if (clip) {
            const clipStart = clip.startTime;
            const clipEnd = clip.startTime + (clip.trimEnd - clip.offset);
            // Only split if playhead is within clip bounds
            if (currentTime > clipStart && currentTime < clipEnd) {
              splitClip(clipId, currentTime);
            }
          }
        }
      }

      // Delete - remove selected clips
      if (e.code === 'Delete') {
        e.preventDefault();
        const { selectedClipIds, removeClip } = useAudioEditorStore.getState();
        for (const clipId of selectedClipIds) {
          removeClip(clipId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [playTimeline, stopPlayback]);

  return (
    <div className="h-full flex flex-col">
      {/* Main toolbar */}
      <EditorToolbar />

      {/* Clip tools (context-sensitive) */}
      <ClipTools />

      {/* Main content area */}
      <AudioEditorDndProvider>
        <div className="relative flex-1 flex overflow-hidden">
          {/* Media pool (left sidebar) */}
          <div className="w-48 shrink-0">
            <MediaPool />
          </div>

          <ShortcutPanel
            open={shortcutsOpen}
            onToggle={() => setShortcutsOpen((open) => !open)}
            shortcuts={AUDIO_EDITOR_SHORTCUTS}
            title="Audio Shortcuts"
          />

          {/* Track list */}
          <TrackList />

          {/* Timeline */}
          <Timeline />
        </div>
      </AudioEditorDndProvider>
    </div>
  );
}

export function AudioEditorPage() {
  return (
    <AudioEditorProvider>
      <AudioEditorContent />
    </AudioEditorProvider>
  );
}
