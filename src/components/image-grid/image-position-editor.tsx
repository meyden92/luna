import { Maximize2, Minimize2, Move, RotateCcw, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { CellDimensions, SelectedImage } from '@/schemas/image-grid';
import styles from './image-position-editor.module.css';

interface ImagePositionEditorProps {
  image: SelectedImage;
  isOpen: boolean;
  onClose: () => void;
  onUpdateOffset: (offsetX: number, offsetY: number, zoom: number) => void;
  cellDimensions: CellDimensions;
}

export function ImagePositionEditor({ image, isOpen, onClose, onUpdateOffset, cellDimensions }: ImagePositionEditorProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [initialOffset, setInitialOffset] = useState({ x: 0, y: 0 });
  const [tempOffset, setTempOffset] = useState({ x: image.offsetX, y: image.offsetY });
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoom, setZoom] = useState(Math.max(1, image.zoom));

  useEffect(() => {
    setTempOffset({ x: image.offsetX, y: image.offsetY });
    setImageLoaded(false);
    setZoom(Math.max(1, image.zoom));
  }, [image.offsetX, image.offsetY, image.zoom]);

  const handleImageLoad = useCallback(() => {
    if (imageRef.current) {
      setImageDimensions({
        width: imageRef.current.naturalWidth,
        height: imageRef.current.naturalHeight,
      });
      setImageLoaded(true);
    }
  }, []);

  const viewportDimensions = useMemo(() => {
    if (!isOpen) return { width: 0, height: 0 };

    const cellAspectRatio = cellDimensions.width / cellDimensions.height;
    const maxSize = isFullscreen ? Math.min(window.innerWidth * 0.8, window.innerHeight * 0.8) : 600;

    let width = maxSize;
    let height = maxSize / cellAspectRatio;

    if (height > maxSize) {
      height = maxSize;
      width = maxSize * cellAspectRatio;
    }

    return { width, height };
  }, [cellDimensions, isFullscreen, isOpen]);

  const imageOverflow = useMemo(() => {
    if (!imageLoaded || !imageDimensions.width || !imageDimensions.height) {
      return { x: 0, y: 0 };
    }

    const imageAspectRatio = imageDimensions.width / imageDimensions.height;
    const cellAspectRatio = cellDimensions.width / cellDimensions.height;

    let baseImageWidth = viewportDimensions.width;
    let baseImageHeight = viewportDimensions.height;

    if (imageAspectRatio > cellAspectRatio) {
      baseImageWidth = viewportDimensions.height * imageAspectRatio;
    } else {
      baseImageHeight = viewportDimensions.width / imageAspectRatio;
    }

    const zoomedImageWidth = baseImageWidth * zoom;
    const zoomedImageHeight = baseImageHeight * zoom;

    return {
      x: Math.max(0, zoomedImageWidth - viewportDimensions.width),
      y: Math.max(0, zoomedImageHeight - viewportDimensions.height),
    };
  }, [imageLoaded, imageDimensions, cellDimensions, viewportDimensions, zoom]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!imageLoaded) return;
      e.preventDefault();
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      setInitialOffset({ x: tempOffset.x, y: tempOffset.y });
    },
    [tempOffset, imageLoaded],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;

      const deltaX = e.clientX - dragStart.x;
      const deltaY = e.clientY - dragStart.y;

      // Convert pixel delta to offset percentage
      const sensitivity = 2; // Adjust for desired sensitivity
      const offsetX = Math.max(-1, Math.min(1, initialOffset.x + (deltaX / Math.max(imageOverflow.x, 100)) * sensitivity));
      const offsetY = Math.max(-1, Math.min(1, initialOffset.y + (deltaY / Math.max(imageOverflow.y, 100)) * sensitivity));

      setTempOffset({ x: offsetX, y: offsetY });
    },
    [isDragging, dragStart, initialOffset, imageOverflow],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleApply = useCallback(() => {
    onUpdateOffset(tempOffset.x, tempOffset.y, zoom);
    onClose();
  }, [tempOffset, zoom, onUpdateOffset, onClose]);

  // Global mouse events for dragging
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'move';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Keyboard navigation and wheel zoom
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const step = e.shiftKey ? 0.1 : 0.05; // Smaller steps with Shift

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          setTempOffset((prev) => ({
            ...prev,
            x: Math.max(-1, prev.x - step),
          }));
          break;
        case 'ArrowRight':
          e.preventDefault();
          setTempOffset((prev) => ({
            ...prev,
            x: Math.min(1, prev.x + step),
          }));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setTempOffset((prev) => ({
            ...prev,
            y: Math.max(-1, prev.y - step),
          }));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setTempOffset((prev) => ({
            ...prev,
            y: Math.min(1, prev.y + step),
          }));
          break;
        case 'Enter':
          e.preventDefault();
          handleApply();
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case 'r':
        case 'R':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setTempOffset({ x: 0, y: 0 });
          }
          break;
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1;
        setZoom((prev) => Math.max(1, Math.min(6, prev + zoomDelta)));
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('wheel', handleWheel);
    };
  }, [isOpen, onClose, handleApply]);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay}>
      {/* Main container */}
      <div
        className={styles.dialog}
        data-fullscreen={isFullscreen ? '' : undefined}
      >
        {/* Header */}
        <div className={styles.header}>
          <div className="cluster space-2">
            <Move className={styles.titleIcon} />
            <h2 className={styles.title}>Position Image: {image.name}</h2>
          </div>
          <div className="cluster space-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              {isFullscreen ? <Minimize2 /> : <Maximize2 />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
            >
              <X />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className={styles.body}>
          {/* Main viewport */}
          <div className={styles.stage}>
            <div className="stack space-2 margin-bottom-4">
              <p className={styles.hint}>
                Drag the image to position it within the grid cell. Use arrow keys for fine control and zoom to get a better view.
              </p>
              <div className={styles.hintKeys}>
                <span>Arrow keys: Fine adjust</span>
                <span>Shift + arrows: Precise adjust</span>
                <span>Ctrl/Cmd + scroll: Zoom</span>
                <span>Ctrl/Cmd + R: Reset</span>
              </div>
            </div>

            {/* Zoom control */}
            <div className={`${styles.zoomControl} stack space-3 margin-bottom-6`}>
              <div className="cluster type-sm">
                <span className="weight-medium">Zoom</span>
                <span className={`${styles.zoomValue} margin-left-auto`}>{Math.round(zoom * 100)}%</span>
              </div>
              <input
                type="range"
                min={1}
                max={6}
                step="0.1"
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className={styles.zoomSlider}
              />
              <div className={styles.presets}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setZoom(1)}
                  className={styles.presetButton}
                >
                  100%
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setZoom(2.0)}
                  className={styles.presetButton}
                >
                  200%
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setZoom(4.0)}
                  className={styles.presetButton}
                >
                  400%
                </Button>
              </div>
            </div>

            {/* Image viewport */}
            <div
              ref={overlayRef}
              className={styles.viewport}
              style={{
                width: viewportDimensions.width,
                height: viewportDimensions.height,
              }}
            >
              {/* Grid cell boundary indicator */}
              <div className={styles.cellBoundary}>
                <div className={styles.cellBoundaryInset} />
              </div>

              {/* Draggable image container */}
              <div
                className={styles.imageLayer}
                onMouseDown={handleMouseDown}
                style={{
                  left: -imageOverflow.x / 2,
                  top: -imageOverflow.y / 2,
                  width: viewportDimensions.width + imageOverflow.x,
                  height: viewportDimensions.height + imageOverflow.y,
                  transform: `translate(${(-tempOffset.x * imageOverflow.x) / 2}px, ${(-tempOffset.y * imageOverflow.y) / 2}px)`,
                  transition: isDragging ? 'none' : 'transform 0.2s ease-out',
                }}
              >
                <img
                  ref={imageRef}
                  src={image.url}
                  alt={image.name}
                  className={styles.image}
                  draggable={false}
                  onLoad={handleImageLoad}
                />
              </div>

              {/* Center crosshair */}
              <div className={styles.crosshair}>
                <div className={styles.crosshairRing}>
                  <div className={styles.crosshairDot} />
                </div>
              </div>

              {/* Grid guidelines: rule of thirds */}
              <div className={styles.guides}>
                <div
                  className={styles.guide}
                  data-axis="x"
                  data-third="1"
                />
                <div
                  className={styles.guide}
                  data-axis="x"
                  data-third="2"
                />
                <div
                  className={styles.guide}
                  data-axis="y"
                  data-third="1"
                />
                <div
                  className={styles.guide}
                  data-axis="y"
                  data-third="2"
                />
              </div>

              {/* Corner indicators */}
              <div
                className={styles.corner}
                data-corner="top-left"
              />
              <div
                className={styles.corner}
                data-corner="top-right"
              />
              <div
                className={styles.corner}
                data-corner="bottom-left"
              />
              <div
                className={styles.corner}
                data-corner="bottom-right"
              />
            </div>
          </div>

          {/* Controls panel */}
          <div className={`${styles.rail} stack space-4`}>
            {/* Position display */}
            <div className="stack space-3">
              <h3 className={styles.railHeading}>Current Position</h3>
              <div className={styles.readout}>
                <div>
                  <div className={styles.readoutLabel}>X Position</div>
                  <div className={styles.readoutValue}>{Math.round(tempOffset.x * 100)}%</div>
                </div>
                <div>
                  <div className={styles.readoutLabel}>Y Position</div>
                  <div className={styles.readoutValue}>{Math.round(tempOffset.y * 100)}%</div>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="stack space-3">
              <Button
                variant="outline"
                onClick={() => setTempOffset({ x: 0, y: 0 })}
                className={styles.fullWidth}
                size="sm"
              >
                <RotateCcw />
                Reset Position
              </Button>

              <div className="stack space-2">
                <Button
                  onClick={handleApply}
                  className={styles.fullWidth}
                >
                  Apply Changes
                </Button>
                <Button
                  variant="outline"
                  onClick={onClose}
                  className={styles.fullWidth}
                  size="sm"
                >
                  Cancel
                </Button>
              </div>
            </div>

            {/* Help text */}
            <div className={`${styles.tips} stack space-1`}>
              <p className={styles.tipsHeading}>Quick Tips:</p>
              <p>• Drag image to reposition</p>
              <p>• Arrow keys for fine control</p>
              <p>• Ctrl/Cmd + scroll to zoom</p>
              <p>• Guidelines help alignment</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
