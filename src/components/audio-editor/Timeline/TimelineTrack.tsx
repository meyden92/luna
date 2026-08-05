import { useDroppable } from '@dnd-kit/core';
import { getAudioClipsForTrack, getTotalAudioDuration, type Track, useAudioEditorStore } from '@/hooks/stores/audio-editor-store';
import { secondsToPixels } from '@/libs/audio-editor/audio-utils';
import { cn } from '@/libs/utils';
import { TimelineClip } from './TimelineClip';

interface TimelineTrackProps {
  track: Track;
  viewportWidth: number;
}

export function TimelineTrack({ track, viewportWidth }: TimelineTrackProps) {
  const clips = useAudioEditorStore((state) => state.clips);
  const pixelsPerSecond = useAudioEditorStore((state) => state.pixelsPerSecond);
  const duration = useAudioEditorStore((state) => getTotalAudioDuration(state.clips));
  const clearSelection = useAudioEditorStore((state) => state.clearSelection);
  const setCurrentTime = useAudioEditorStore((state) => state.setCurrentTime);

  const { setNodeRef, isOver } = useDroppable({
    id: `track-${track.id}`,
    data: { type: 'track', track },
  });

  const trackClips = getAudioClipsForTrack(track, clips);
  const totalWidth = Math.max(secondsToPixels(duration, pixelsPerSecond) + 200, viewportWidth);

  const handleClick = (e: React.MouseEvent) => {
    // Check if click was on a clip element
    const target = e.target as HTMLElement;
    const isOnClip = target.closest('[data-clip]');

    if (!isOnClip) {
      clearSelection();

      // Calculate click position to set playhead
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const time = x / pixelsPerSecond;
      setCurrentTime(Math.max(0, time));
    }
  };

  return (
    <div
      ref={setNodeRef}
      className={cn('relative h-20 border-b border-border transition-colors', isOver && 'bg-primary/10', track.isMuted && 'opacity-50')}
      style={{ width: totalWidth }}
      onClick={handleClick}
      data-track-bg
    >
      {/* Grid lines */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `repeating-linear-gradient(to right, transparent, transparent ${secondsToPixels(1, pixelsPerSecond) - 1}px, hsl(var(--border) / 0.3) ${secondsToPixels(1, pixelsPerSecond)}px)`,
        }}
        data-track-bg
      />

      {/* Clips */}
      {trackClips.map((clip) => (
        <TimelineClip
          key={clip.id}
          clip={clip}
        />
      ))}
    </div>
  );
}
