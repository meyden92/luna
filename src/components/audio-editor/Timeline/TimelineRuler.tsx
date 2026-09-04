import { useMemo } from 'react';
import { getTotalAudioDuration, useAudioEditorStore } from '@/hooks/stores/audio-editor-store';
import { generateTimeMarkers, secondsToPixels } from '@/libs/audio-editor/audio-utils';
import styles from './TimelineRuler.module.css';

interface TimelineRulerProps {
  viewportWidth: number;
}

export function TimelineRuler({ viewportWidth }: TimelineRulerProps) {
  const pixelsPerSecond = useAudioEditorStore((state) => state.pixelsPerSecond);
  const duration = useAudioEditorStore((state) => getTotalAudioDuration(state.clips));

  const markers = useMemo(() => generateTimeMarkers(duration, pixelsPerSecond, viewportWidth), [duration, pixelsPerSecond, viewportWidth]);

  const totalWidth = Math.max(secondsToPixels(duration, pixelsPerSecond) + 200, viewportWidth);

  return (
    <div
      className={styles.ruler}
      style={{ width: totalWidth }}
    >
      {markers.map((marker) => {
        const x = secondsToPixels(marker.time, pixelsPerSecond);
        return (
          <div
            key={marker.time}
            className={styles.marker}
            style={{ left: x }}
          >
            <div
              className={styles.tick}
              data-major={marker.isMajor}
            />
            {marker.isMajor && <span className={styles.label}>{marker.label}</span>}
          </div>
        );
      })}
    </div>
  );
}
