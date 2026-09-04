import { useCallback, useRef } from 'react';
import type { CropBox } from '@/hooks/stores/video-editor-store';
import styles from './CropOverlay.module.css';

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
      className={styles.root}
    >
      {/* Dim overlays: top, left, right, bottom */}
      <div
        className={styles.scrim}
        style={{ top: 0, left: 0, right: 0, height: pct(crop.y) }}
      />
      <div
        className={styles.scrim}
        style={{ top: pct(crop.y), left: 0, height: pct(crop.h), width: pct(crop.x) }}
      />
      <div
        className={styles.scrim}
        style={{ top: pct(crop.y), right: 0, height: pct(crop.h), left: pct(crop.x + crop.w) }}
      />
      <div
        className={styles.scrim}
        style={{ top: pct(crop.y + crop.h), left: 0, right: 0, bottom: 0 }}
      />

      {/* Crop box */}
      <div
        className={styles.box}
        style={{
          left: pct(crop.x),
          top: pct(crop.y),
          width: pct(crop.w),
          height: pct(crop.h),
        }}
        onPointerDown={onPointerDown('move')}
      >
        {(['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se'] as const).map((handle) => (
          <div
            key={handle}
            className={styles.handle}
            data-handle={handle}
            onPointerDown={onPointerDown(handle)}
          />
        ))}
      </div>
    </div>
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
