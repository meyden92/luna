import { useMemo } from 'react';
import { getTotalAudioDuration, useAudioEditorStore } from '@/hooks/stores/audio-editor-store';
import { generateTimeMarkers, secondsToPixels } from '@/libs/audio-editor/audio-utils';
import { cn } from '@/libs/utils';

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
      className="relative h-6 bg-muted/50 border-b border-border select-none"
      style={{ width: totalWidth }}
    >
      {markers.map((marker) => {
        const x = secondsToPixels(marker.time, pixelsPerSecond);
        return (
          <div
            key={marker.time}
            className="absolute top-0 flex flex-col items-center"
            style={{ left: x }}
          >
            <div className={cn('w-px bg-border', marker.isMajor ? 'h-4' : 'h-2')} />
            {marker.isMajor && <span className="text-[10px] text-muted-foreground whitespace-nowrap mt-0.5">{marker.label}</span>}
          </div>
        );
      })}
    </div>
  );
}
