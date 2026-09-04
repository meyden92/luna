import { useAudioEditorStore } from '@/hooks/stores/audio-editor-store';
import { secondsToPixels } from '@/libs/audio-editor/audio-utils';
import styles from './TimelinePlayhead.module.css';

export function TimelinePlayhead() {
  const currentTime = useAudioEditorStore((state) => state.currentTime);
  const pixelsPerSecond = useAudioEditorStore((state) => state.pixelsPerSecond);
  const x = secondsToPixels(currentTime, pixelsPerSecond);

  return (
    <div
      className={styles.playhead}
      style={{ left: x }}
    >
      {/* Playhead handle */}
      <div className={styles.grip} />
    </div>
  );
}
