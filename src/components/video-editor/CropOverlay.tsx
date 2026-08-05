import { useCallback, useRef } from 'react';
import type { CropBox } from '@/hooks/stores/video-editor-store';

type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';

interface CropOverlayProps {
  crop: CropBox;
  aspectRatio: number | null;
  onChange: (crop: CropBox) => void;
}

export function CropOverlay({ crop, aspectRatio, onChange }: CropOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const onPointerDown = useCallback(
    (handle: Handle) => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      const start = { ...crop };

      (e.target as Element).setPointerCapture(e.pointerId);

      const onMove = (ev: PointerEvent) => {
        const dx = (ev.clientX - startX) / rect.width;
        const dy = (ev.clientY - startY) / rect.height;
        onChange(applyDelta(start, handle, dx, dy, aspectRatio));
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [crop, aspectRatio, onChange],
  );

  const pct = (n: number) => `${n * 100}%`;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none"
    >
      {/* Dim overlays: top, left, right, bottom */}
      <div
        className="absolute left-0 right-0 bg-black/55"
        style={{ top: 0, height: pct(crop.y) }}
      />
      <div
        className="absolute left-0 bg-black/55"
        style={{ top: pct(crop.y), height: pct(crop.h), width: pct(crop.x) }}
      />
      <div
        className="absolute right-0 bg-black/55"
        style={{ top: pct(crop.y), height: pct(crop.h), left: pct(crop.x + crop.w) }}
      />
      <div
        className="absolute left-0 right-0 bg-black/55"
        style={{ top: pct(crop.y + crop.h), bottom: 0 }}
      />

      {/* Crop box */}
      <div
        className="absolute border-2 border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.4)] pointer-events-auto cursor-move"
        style={{
          left: pct(crop.x),
          top: pct(crop.y),
          width: pct(crop.w),
          height: pct(crop.h),
        }}
        onPointerDown={onPointerDown('move')}
      >
        {/* Edge handles */}
        <Handle
          className="top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize"
          onPointerDown={onPointerDown('n')}
        />
        <Handle
          className="bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 cursor-ns-resize"
          onPointerDown={onPointerDown('s')}
        />
        <Handle
          className="top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize"
          onPointerDown={onPointerDown('w')}
        />
        <Handle
          className="top-1/2 right-0 translate-x-1/2 -translate-y-1/2 cursor-ew-resize"
          onPointerDown={onPointerDown('e')}
        />
        {/* Corner handles */}
        <Handle
          className="top-0 left-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize"
          onPointerDown={onPointerDown('nw')}
        />
        <Handle
          className="top-0 right-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize"
          onPointerDown={onPointerDown('ne')}
        />
        <Handle
          className="bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize"
          onPointerDown={onPointerDown('sw')}
        />
        <Handle
          className="bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize"
          onPointerDown={onPointerDown('se')}
        />
      </div>
    </div>
  );
}

function Handle({ className, onPointerDown }: { className: string; onPointerDown: (e: React.PointerEvent) => void }) {
  return (
    <div
      onPointerDown={onPointerDown}
      className={`absolute size-3 rounded-sm bg-white border border-black/30 pointer-events-auto ${className}`}
    />
  );
}

const MIN = 0.05;

function applyDelta(start: CropBox, handle: Handle, dx: number, dy: number, aspect: number | null): CropBox {
  let { x, y, w, h } = start;

  if (handle === 'move') {
    x = clamp(start.x + dx, 0, 1 - start.w);
    y = clamp(start.y + dy, 0, 1 - start.h);
    return { x, y, w, h };
  }

  let newX = start.x;
  let newY = start.y;
  let newW = start.w;
  let newH = start.h;

  if (handle.includes('w')) {
    const nx = clamp(start.x + dx, 0, start.x + start.w - MIN);
    newW = start.x + start.w - nx;
    newX = nx;
  }
  if (handle.includes('e')) {
    newW = clamp(start.w + dx, MIN, 1 - start.x);
  }
  if (handle.includes('n')) {
    const ny = clamp(start.y + dy, 0, start.y + start.h - MIN);
    newH = start.y + start.h - ny;
    newY = ny;
  }
  if (handle.includes('s')) {
    newH = clamp(start.h + dy, MIN, 1 - start.y);
  }

  if (aspect && aspect > 0) {
    // Enforce aspect ratio (width / height in container-relative space).
    // We treat aspect as a ratio of normalized w/h; since container may not be square,
    // aspect here is pre-scaled by caller to be normalized-space ratio.
    const currentRatio = newW / newH;
    if (currentRatio > aspect) {
      // Too wide → shrink width
      const targetW = newH * aspect;
      if (handle.includes('w')) newX = newX + (newW - targetW);
      newW = targetW;
    } else {
      const targetH = newW / aspect;
      if (handle.includes('n')) newY = newY + (newH - targetH);
      newH = targetH;
    }
  }

  newX = clamp(newX, 0, 1 - MIN);
  newY = clamp(newY, 0, 1 - MIN);
  newW = clamp(newW, MIN, 1 - newX);
  newH = clamp(newH, MIN, 1 - newY);

  return { x: newX, y: newY, w: newW, h: newH };
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
