import { useDraggable } from '@dnd-kit/core';
import { GripVerticalIcon } from 'lucide-react';
import { useCallback, useState } from 'react';
import { type AudioClip, useAudioEditorStore } from '@/hooks/stores/audio-editor-store';
import { formatTimeShort, pixelsToSeconds, secondsToPixels } from '@/libs/audio-editor/audio-utils';
import { WaveformDisplay } from '../Waveform/WaveformDisplay';
import styles from './TimelineClip.module.css';

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
      className={styles.clip}
      data-selected={isSelected}
      data-dragging={isDragging}
      style={style}
      onClick={handleClick}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className={styles.handle}
      >
        <GripVerticalIcon className={styles.handleIcon} />
        <span className={styles.handleName}>{clip.name}</span>
        <span className={styles.handleDuration}>{formatTimeShort(clipDuration)}</span>
      </div>

      {/* Waveform */}
      <div className={styles.waveform}>
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
        className={styles.trimHandle}
        data-side="start"
        data-active={isTrimming === 'start'}
        onPointerDown={handleTrimStart}
      />

      {/* Trim handle - end */}
      <div
        className={styles.trimHandle}
        data-side="end"
        data-active={isTrimming === 'end'}
        onPointerDown={handleTrimEnd}
      />

      {/* Fade indicators */}
      {clip.fadeIn > 0 && (
        <div
          className={styles.fade}
          data-side="in"
          style={{ width: secondsToPixels(clip.fadeIn, pixelsPerSecond) }}
        />
      )}
      {clip.fadeOut > 0 && (
        <div
          className={styles.fade}
          data-side="out"
          style={{ width: secondsToPixels(clip.fadeOut, pixelsPerSecond) }}
        />
      )}

      {/* Trim bracket indicators */}
      {(isSelected || isTrimming) && (
        <>
          {/* Left bracket [ */}
          <div
            className={styles.bracket}
            data-side="start"
          />
          {/* Right bracket ] */}
          <div
            className={styles.bracket}
            data-side="end"
          />
        </>
      )}
    </div>
  );
}
