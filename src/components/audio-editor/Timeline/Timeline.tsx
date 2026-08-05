import { useEffect, useRef, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAudioEditorStore } from '@/hooks/stores/audio-editor-store';
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
      className="flex-1 flex flex-col overflow-hidden bg-background"
    >
      <ScrollArea className="flex-1 overflow-auto">
        <div className="relative min-w-full">
          {/* Ruler */}
          <TimelineRuler viewportWidth={viewportWidth} />

          {/* Tracks container */}
          <div className="relative">
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
              <div className="h-20 flex flex-col items-center justify-center gap-1 text-center text-muted-foreground text-sm">
                <span>Import audio in the Media Pool to begin.</span>
                <span className="text-xs">A destination track appears after your first file loads.</span>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
