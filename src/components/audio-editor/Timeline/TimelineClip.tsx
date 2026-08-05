import { useDraggable } from '@dnd-kit/core';
import { GripVerticalIcon } from 'lucide-react';
import { useCallback, useState } from 'react';
import { type AudioClip, useAudioEditorStore } from '@/hooks/stores/audio-editor-store';
import { formatTimeShort, pixelsToSeconds, secondsToPixels } from '@/libs/audio-editor/audio-utils';
import { cn } from '@/libs/utils';
import { WaveformDisplay } from '../Waveform/WaveformDisplay';

interface TimelineClipProps {
  clip: AudioClip;
  isOverlay?: boolean;
}

export function TimelineClip({ clip, isOverlay = false }: TimelineClipProps) {
  const pixelsPerSecond = useAudioEditorStore((state) => state.pixelsPerSecond);
  const selectedClipIds = useAudioEditorStore((state) => state.selectedClipIds);
  const selectClip = useAudioEditorStore((state) => state.selectClip);
  const updateClip = useAudioEditorStore((state) => state.updateClip);
  const setCurrentTime = useAudioEditorStore((state) => state.setCurrentTime);

  const isSelected = selectedClipIds.has(clip.id);

  const clipDuration = clip.trimEnd - clip.offset;
  const width = secondsToPixels(clipDuration, pixelsPerSecond);
  const left = secondsToPixels(clip.startTime, pixelsPerSecond);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: clip.id,
    data: { type: 'clip', clip },
    disabled: isOverlay,
  });

  // Apply transform directly to the clip for smooth dragging
  const style: React.CSSProperties = {
    left: isOverlay ? 0 : left,
    width,
    zIndex: isDragging ? 100 : isSelected ? 20 : 10,
    // Apply drag transform directly
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    // Add shadow when dragging
    boxShadow: isDragging ? '0 4px 12px rgba(0,0,0,0.3)' : undefined,
  };

  // Trim handles
  const [isTrimming, setIsTrimming] = useState<'start' | 'end' | null>(null);

  // Pointer capture scopes the drag listeners to the handle element, so an
  // unmount mid-drag tears them down naturally instead of leaking on window.
  const handleTrimStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      setIsTrimming('start');

      const handle = e.currentTarget;
      handle.setPointerCapture(e.pointerId);
      const startX = e.clientX;
      const originalOffset = clip.offset;
      const originalStartTime = clip.startTime;

      const handleMove = (moveEvent: PointerEvent) => {
        const deltaX = moveEvent.clientX - startX;
        const deltaTime = pixelsToSeconds(deltaX, pixelsPerSecond);

        const newOffset = Math.max(0, Math.min(clip.trimEnd - 0.1, originalOffset + deltaTime));
        const newStartTime = originalStartTime + (newOffset - originalOffset);

        updateClip(clip.id, {
          offset: newOffset,
          startTime: Math.max(0, newStartTime),
        });
      };

      const handleUp = () => {
        setIsTrimming(null);
        handle.removeEventListener('pointermove', handleMove);
        handle.removeEventListener('pointerup', handleUp);
      };

      handle.addEventListener('pointermove', handleMove);
      handle.addEventListener('pointerup', handleUp);
    },
    [clip, pixelsPerSecond, updateClip],
  );

  const handleTrimEnd = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      setIsTrimming('end');

      const handle = e.currentTarget;
      handle.setPointerCapture(e.pointerId);
      const startX = e.clientX;
      const originalTrimEnd = clip.trimEnd;

      const handleMove = (moveEvent: PointerEvent) => {
        const deltaX = moveEvent.clientX - startX;
        const deltaTime = pixelsToSeconds(deltaX, pixelsPerSecond);

        const newTrimEnd = Math.max(clip.offset + 0.1, Math.min(clip.duration, originalTrimEnd + deltaTime));

        updateClip(clip.id, {
          trimEnd: newTrimEnd,
        });
      };

      const handleUp = () => {
        setIsTrimming(null);
        handle.removeEventListener('pointermove', handleMove);
        handle.removeEventListener('pointerup', handleUp);
      };

      handle.addEventListener('pointermove', handleMove);
      handle.addEventListener('pointerup', handleUp);
    },
    [clip, pixelsPerSecond, updateClip],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      selectClip(clip.id, e.shiftKey || e.ctrlKey || e.metaKey);

      // Calculate click position relative to clip and set playhead
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickOffsetSeconds = pixelsToSeconds(clickX, pixelsPerSecond);
      setCurrentTime(clip.startTime + clickOffsetSeconds);
    },
    [clip.id, clip.startTime, selectClip, setCurrentTime, pixelsPerSecond],
  );

  return (
    <div
      ref={setNodeRef}
      data-clip
      className={cn(
        'absolute top-1 bottom-1 rounded-md overflow-hidden cursor-pointer group',
        'bg-primary/20 border border-primary/50',
        isSelected && 'ring-2 ring-primary shadow-lg',
        isDragging && 'cursor-grabbing',
      )}
      style={style}
      onClick={handleClick}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute top-0 left-0 right-0 h-5 flex items-center gap-1 px-1 bg-primary/30 cursor-grab active:cursor-grabbing"
      >
        <GripVerticalIcon className="size-3 text-primary-foreground/70" />
        <span className="text-[10px] text-primary-foreground/90 truncate font-medium">{clip.name}</span>
        <span className="text-[10px] text-primary-foreground/60 ml-auto">{formatTimeShort(clipDuration)}</span>
      </div>

      {/* Waveform */}
      <div className="absolute top-5 left-0 right-0 bottom-0 px-0.5">
        {clip.fileUrl && width > 0 && (
          <WaveformDisplay
            fileUrl={clip.fileUrl}
            width={Math.max(width - 4, 50)}
            height={50}
          />
        )}
      </div>

      {/* Trim handle - start */}
      <div
        className={cn(
          'absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize',
          'hover:bg-primary/40 transition-colors',
          isTrimming === 'start' && 'bg-primary/50',
        )}
        onPointerDown={handleTrimStart}
      />

      {/* Trim handle - end */}
      <div
        className={cn(
          'absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize',
          'hover:bg-primary/40 transition-colors',
          isTrimming === 'end' && 'bg-primary/50',
        )}
        onPointerDown={handleTrimEnd}
      />

      {/* Fade indicators */}
      {clip.fadeIn > 0 && (
        <div
          className="absolute top-5 left-0 bottom-0 bg-gradient-to-r from-black/50 to-transparent pointer-events-none"
          style={{ width: secondsToPixels(clip.fadeIn, pixelsPerSecond) }}
        />
      )}
      {clip.fadeOut > 0 && (
        <div
          className="absolute top-5 right-0 bottom-0 bg-gradient-to-l from-black/50 to-transparent pointer-events-none"
          style={{ width: secondsToPixels(clip.fadeOut, pixelsPerSecond) }}
        />
      )}

      {/* Trim bracket indicators */}
      {(isSelected || isTrimming) && (
        <>
          {/* Left bracket [ */}
          <div className="absolute left-0 top-0 bottom-0 w-1.5 pointer-events-none">
            <div className="absolute left-0 top-0 w-1.5 h-2.5 border-l-2 border-t-2 border-primary" />
            <div className="absolute left-0 top-2.5 bottom-2.5 border-l-2 border-primary" />
            <div className="absolute left-0 bottom-0 w-1.5 h-2.5 border-l-2 border-b-2 border-primary" />
          </div>
          {/* Right bracket ] */}
          <div className="absolute right-0 top-0 bottom-0 w-1.5 pointer-events-none">
            <div className="absolute right-0 top-0 w-1.5 h-2.5 border-r-2 border-t-2 border-primary" />
            <div className="absolute right-0 top-2.5 bottom-2.5 border-r-2 border-primary" />
            <div className="absolute right-0 bottom-0 w-1.5 h-2.5 border-r-2 border-b-2 border-primary" />
          </div>
        </>
      )}
    </div>
  );
}
