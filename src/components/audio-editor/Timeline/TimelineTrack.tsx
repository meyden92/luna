import { useDroppable } from '@dnd-kit/core';
import { getAudioClipsForTrack, getTotalAudioDuration, type Track, useAudioEditorStore } from '@/hooks/stores/audio-editor-store';
import { secondsToPixels } from '@/libs/audio-editor/audio-utils';
import { TimelineClip } from './TimelineClip';
import styles from './TimelineTrack.module.css';

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
      className={styles.track}
      data-over={isOver}
      data-muted={track.isMuted}
      style={{ width: totalWidth }}
      onClick={handleClick}
      data-track-bg
    >
      {/* Grid lines */}
      <div
        className={styles.grid}
        style={{ '--grid-step': `${secondsToPixels(1, pixelsPerSecond)}px` } as React.CSSProperties}
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
