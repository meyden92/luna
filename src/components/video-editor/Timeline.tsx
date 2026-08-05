import { XIcon } from 'lucide-react';
import { useCallback, useRef } from 'react';
import { useVideoEditorStore } from '@/hooks/stores/video-editor-store';
import { cn } from '@/libs/utils';
import { formatTime } from '@/libs/video-editor/ffmpeg-video';
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
    <div className="px-6 pt-3 pb-2">
      <div
        ref={containerRef}
        className="relative h-16 bg-muted/40 rounded-sm overflow-hidden select-none"
        onPointerDown={onTrackClick}
      >
        {/* Thumbnails */}
        <div className="absolute inset-0 flex">
          {thumbnails.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-[11px] text-muted-foreground/70">Generating thumbnails…</div>
          ) : (
            thumbnails.map((url, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: thumbnail strip is static per video
                key={i}
                className="flex-1 h-full bg-cover bg-center"
                style={{ backgroundImage: `url(${url})` }}
              />
            ))
          )}
        </div>

        {/* Dim outside trim range */}
        <div
          className="absolute top-0 bottom-0 bg-black/60 pointer-events-none"
          style={{ left: 0, width: `${pctOf(trimStart)}%` }}
        />
        <div
          className="absolute top-0 bottom-0 bg-black/60 pointer-events-none"
          style={{ right: 0, width: `${100 - pctOf(trimEnd)}%` }}
        />

        {/* Cut segments (red) */}
        {cuts.map((c) => {
          const left = pctOf(c.start);
          const width = pctOf(c.end) - left;
          return (
            <div
              key={c.id}
              className="absolute top-0 bottom-0 bg-destructive/40 border-x-2 border-destructive/80 pointer-events-auto group"
              style={{ left: `${left}%`, width: `${width}%` }}
            >
              <button
                type="button"
                onClick={() => removeCut(c.id)}
                className="absolute top-1 right-1 p-0.5 rounded-sm bg-background/80 text-destructive opacity-0 group-hover:opacity-100 hover:bg-background"
                aria-label="Remove cut"
              >
                <XIcon className="size-3" />
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

      <div className="relative mt-1 h-4 text-[11px] text-muted-foreground font-mono">
        <span
          className="absolute text-cyan-400"
          style={{ left: `${pctOf(trimStart)}%`, transform: 'translateX(-50%)' }}
        >
          {formatTime(trimStart)}
        </span>
        <span
          className="absolute"
          style={{ left: `${pctOf(duration / 2)}%`, transform: 'translateX(-50%)' }}
        >
          {formatTime(duration / 2)}
        </span>
        <span
          className="absolute text-cyan-400"
          style={{ left: `${pctOf(trimEnd)}%`, transform: 'translateX(-50%)' }}
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
      className={cn('absolute top-0 bottom-0 w-2 bg-cyan-400 cursor-ew-resize z-20', side === 'left' ? 'rounded-l-sm' : 'rounded-r-sm')}
      style={{ left: `calc(${leftPct}% - 4px)` }}
    >
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-0.5">
        <span className="block w-px h-2 bg-cyan-900/70" />
        <span className="block w-px h-2 bg-cyan-900/70" />
      </div>
    </div>
  );
}

function Playhead({ leftPct, time, onPointerDown }: { leftPct: number; time: number; onPointerDown: (e: React.PointerEvent) => void }) {
  return (
    <div
      className="absolute top-0 bottom-0 z-30 pointer-events-none"
      style={{ left: `${leftPct}%` }}
    >
      <div
        onPointerDown={onPointerDown}
        className="absolute top-0 bottom-0 -translate-x-1/2 w-3 pointer-events-auto cursor-ew-resize flex flex-col items-center"
      >
        <div className="px-1.5 py-0.5 rounded bg-background/90 border border-border text-[10px] font-mono text-foreground -translate-y-5 whitespace-nowrap">
          {formatTime(time)}
        </div>
        <div className="absolute top-0 bottom-0 w-px bg-cyan-400" />
      </div>
    </div>
  );
}
