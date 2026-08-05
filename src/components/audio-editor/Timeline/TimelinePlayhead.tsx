import { useAudioEditorStore } from '@/hooks/stores/audio-editor-store';
import { secondsToPixels } from '@/libs/audio-editor/audio-utils';

export function TimelinePlayhead() {
  const currentTime = useAudioEditorStore((state) => state.currentTime);
  const pixelsPerSecond = useAudioEditorStore((state) => state.pixelsPerSecond);
  const x = secondsToPixels(currentTime, pixelsPerSecond);

  return (
    <div
      className="absolute top-0 bottom-0 w-px bg-red-500 z-30 pointer-events-none"
      style={{ left: x }}
    >
      {/* Playhead handle */}
      <div className="absolute -top-1 -left-1.5 w-3 h-3 bg-red-500 rounded-sm" />
    </div>
  );
}
