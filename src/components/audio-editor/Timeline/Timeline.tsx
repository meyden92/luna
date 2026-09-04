import { useEffect, useRef, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAudioEditorStore } from '@/hooks/stores/audio-editor-store';
import styles from './Timeline.module.css';
import { TimelinePlayhead } from './TimelinePlayhead';
import { TimelineRuler } from './TimelineRuler';
import { TimelineTrack } from './TimelineTrack';

export function Timeline() {
  const tracks = useAudioEditorStore((state) => state.tracks);
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(800);

  // Measure viewport on mount and resize
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setViewportWidth(containerRef.current.clientWidth);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div
      ref={containerRef}
      className={styles.root}
    >
      <ScrollArea className={styles.scroll}>
        <div className={styles.surface}>
          {/* Ruler */}
          <TimelineRuler viewportWidth={viewportWidth} />

          {/* Tracks container */}
          <div className={styles.tracks}>
            {/* Playhead */}
            <TimelinePlayhead />

            {/* Tracks */}
            {tracks.map((track) => (
              <TimelineTrack
                key={track.id}
                track={track}
                viewportWidth={viewportWidth}
              />
            ))}

            {/* Empty state placeholder */}
            {tracks.length === 0 && (
              <div className={styles.empty}>
                <span>Import audio in the Media Pool to begin.</span>
                <span className={styles.emptyHint}>A destination track appears after your first file loads.</span>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
