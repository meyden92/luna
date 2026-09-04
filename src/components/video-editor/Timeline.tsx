import { XIcon } from 'lucide-react';
import { useCallback, useRef } from 'react';
import { useVideoEditorStore } from '@/hooks/stores/video-editor-store';
import { formatTime } from '@/libs/video-editor/ffmpeg-video';
import styles from './Timeline.module.css';
import { seekTo } from './video-ref';

type Drag = 'start' | 'end' | 'playhead';

export function Timeline() {
  const containerRef = useRef<HTMLDivElement>(null);
  const duration = useVideoEditorStore((s) => s.duration);
  const trimStart = useVideoEditorStore((s) => s.trimStart);
  const trimEnd = useVideoEditorStore((s) => s.trimEnd);
  const currentTime = useVideoEditorStore((s) => s.currentTime);
  const cuts = useVideoEditorStore((s) => s.cuts);
  const thumbnails = useVideoEditorStore((s) => s.thumbnails);
  const setTrim = useVideoEditorStore((s) => s.setTrim);
  const removeCut = useVideoEditorStore((s) => s.removeCut);
  const setCurrentTime = useVideoEditorStore((s) => s.setCurrentTime);

  const pctOf = useCallback((t: number) => (duration > 0 ? (t / duration) * 100 : 0), [duration]);

  const handleDrag = useCallback(
    (type: Drag) => (e: React.PointerEvent) => {
      e.preventDefault();
      const el = containerRef.current;
      if (!el) return;
      (e.target as Element).setPointerCapture(e.pointerId);

      const onMove = (ev: PointerEvent) => {
        const rect = el.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
        const t = pct * duration;
        if (type === 'start') setTrim(t, trimEnd);
        else if (type === 'end') setTrim(trimStart, t);
        else {
          setCurrentTime(t);
          seekTo(t);
        }
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [duration, trimStart, trimEnd, setTrim, setCurrentTime],
  );

  const onTrackClick = useCallback(
    (e: React.PointerEvent) => {
      if (e.target !== e.currentTarget) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pct = (e.clientX - rect.left) / rect.width;
      const t = Math.max(0, Math.min(duration, pct * duration));
      setCurrentTime(t);
      seekTo(t);
    },
    [duration, setCurrentTime],
  );

  return (
    <div className={styles.root}>
      <div
        ref={containerRef}
        className={styles.track}
        onPointerDown={onTrackClick}
      >
        {/* Thumbnails */}
        <div className={styles.thumbnails}>
          {thumbnails.length === 0 ? (
            <div className={styles.thumbnailsPending}>Generating thumbnails…</div>
          ) : (
            thumbnails.map((url, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: thumbnail strip is static per video
                key={i}
                className={styles.thumbnail}
                style={{ backgroundImage: `url(${url})` }}
              />
            ))
          )}
        </div>

        {/* Dim outside trim range */}
        <div
          className={styles.dim}
          style={{ left: 0, width: `${pctOf(trimStart)}%` }}
        />
        <div
          className={styles.dim}
          style={{ right: 0, width: `${100 - pctOf(trimEnd)}%` }}
        />

        {/* Cut segments */}
        {cuts.map((c) => {
          const left = pctOf(c.start);
          const width = pctOf(c.end) - left;
          return (
            <div
              key={c.id}
              className={styles.cut}
              style={{ left: `${left}%`, width: `${width}%` }}
            >
              <button
                type="button"
                onClick={() => removeCut(c.id)}
                className={styles.cutRemove}
                aria-label="Remove cut"
              >
                <XIcon />
              </button>
            </div>
          );
        })}

        {/* Trim handles */}
        <TrimHandle
          leftPct={pctOf(trimStart)}
          onPointerDown={handleDrag('start')}
          side="left"
        />
        <TrimHandle
          leftPct={pctOf(trimEnd)}
          onPointerDown={handleDrag('end')}
          side="right"
        />

        {/* Playhead */}
        <Playhead
          leftPct={pctOf(currentTime)}
          time={currentTime}
          onPointerDown={handleDrag('playhead')}
        />
      </div>

      <div className={styles.ruler}>
        <span
          className={styles.rulerMark}
          data-edge="true"
          style={{ left: `${pctOf(trimStart)}%` }}
        >
          {formatTime(trimStart)}
        </span>
        <span
          className={styles.rulerMark}
          style={{ left: `${pctOf(duration / 2)}%` }}
        >
          {formatTime(duration / 2)}
        </span>
        <span
          className={styles.rulerMark}
          data-edge="true"
          style={{ left: `${pctOf(trimEnd)}%` }}
        >
          {formatTime(trimEnd)}
        </span>
      </div>
    </div>
  );
}

function TrimHandle({
  leftPct,
  side,
  onPointerDown,
}: {
  leftPct: number;
  side: 'left' | 'right';
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  return (
    <div
      onPointerDown={onPointerDown}
      className={styles.handle}
      data-side={side}
      style={{ left: `calc(${leftPct}% - 4px)` }}
    >
      <div className={styles.grip}>
        <span />
        <span />
      </div>
    </div>
  );
}

function Playhead({ leftPct, time, onPointerDown }: { leftPct: number; time: number; onPointerDown: (e: React.PointerEvent) => void }) {
  return (
    <div
      className={styles.playhead}
      style={{ left: `${leftPct}%` }}
    >
      <div
        onPointerDown={onPointerDown}
        className={styles.playheadGrab}
      >
        <div className={styles.playheadLabel}>{formatTime(time)}</div>
        <div className={styles.playheadLine} />
      </div>
    </div>
  );
}
