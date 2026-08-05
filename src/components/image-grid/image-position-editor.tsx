import { Maximize2, Minimize2, Move, RotateCcw, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { CellDimensions, SelectedImage } from '@/schemas/image-grid';

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
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
      {/* Main container */}
      <div
        className={`bg-background rounded-lg shadow-xl flex flex-col max-h-[95vh] ${
          isFullscreen ? 'w-[95vw] h-[95vh]' : 'w-full max-w-6xl h-auto'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Move className="h-5 w-5" />
            <h2 className="text-lg font-semibold">Position Image: {image.name}</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* Main viewport */}
          <div className="flex-1 flex flex-col items-center justify-center p-6 min-h-0">
            <div className="text-center mb-4">
              <p className="text-sm text-muted-foreground mb-2">
                Drag the image to position it within the grid cell. Use arrow keys for fine control and zoom to get a better view.
              </p>
              <div className="text-xs text-muted-foreground space-x-4">
                <span>Arrow keys: Fine adjust</span>
                <span>Shift + arrows: Precise adjust</span>
                <span>Ctrl/Cmd + scroll: Zoom</span>
                <span>Ctrl/Cmd + R: Reset</span>
              </div>
            </div>

            {/* Zoom control */}
            <div className="w-full max-w-md mb-6">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="font-medium">Zoom</span>
                <span className="font-mono text-primary">{Math.round(zoom * 100)}%</span>
              </div>
              <input
                type="range"
                min={1}
                max={6}
                step="0.1"
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full mb-3"
              />
              <div className="flex gap-2 justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setZoom(1)}
                  className="text-xs px-3"
                >
                  100%
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setZoom(2.0)}
                  className="text-xs px-3"
                >
                  200%
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setZoom(4.0)}
                  className="text-xs px-3"
                >
                  400%
                </Button>
              </div>
            </div>

            {/* Image viewport */}
            <div
              ref={overlayRef}
              className="relative border-2 border-primary rounded-lg overflow-hidden shadow-lg"
              style={{
                width: viewportDimensions.width,
                height: viewportDimensions.height,
              }}
            >
              {/* Grid cell boundary indicator */}
              <div className="absolute inset-0 border-4 border-primary/50 bg-primary/5 pointer-events-none z-20">
                <div className="absolute inset-2 border border-primary/30 border-dashed" />
              </div>

              {/* Draggable image container */}
              <div
                className="absolute cursor-move overflow-hidden"
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
                  className="w-full h-full object-cover select-none pointer-events-none"
                  draggable={false}
                  onLoad={handleImageLoad}
                />
              </div>

              {/* Center crosshair */}
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none z-30">
                <div className="w-6 h-6 border-2 border-white rounded-full bg-primary/20 flex items-center justify-center">
                  <div className="w-2 h-2 bg-primary rounded-full" />
                </div>
              </div>

              {/* Grid guidelines */}
              <div className="absolute inset-0 pointer-events-none z-10">
                {/* Rule of thirds lines */}
                <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/30" />
                <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/30" />
                <div className="absolute top-1/3 left-0 right-0 h-px bg-white/30" />
                <div className="absolute top-2/3 left-0 right-0 h-px bg-white/30" />
              </div>

              {/* Corner indicators */}
              <div className="absolute top-2 left-2 w-3 h-3 border-l-2 border-t-2 border-white pointer-events-none z-20" />
              <div className="absolute top-2 right-2 w-3 h-3 border-r-2 border-t-2 border-white pointer-events-none z-20" />
              <div className="absolute bottom-2 left-2 w-3 h-3 border-l-2 border-b-2 border-white pointer-events-none z-20" />
              <div className="absolute bottom-2 right-2 w-3 h-3 border-r-2 border-b-2 border-white pointer-events-none z-20" />
            </div>
          </div>

          {/* Controls panel */}
          <div className="w-full lg:w-64 border-t lg:border-t-0 lg:border-l p-4 space-y-4 bg-muted/5">
            {/* Position display */}
            <div className="space-y-3">
              <h3 className="font-medium text-sm">Current Position</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="text-center">
                  <div className="text-muted-foreground text-xs">X Position</div>
                  <div className="text-base font-mono">{Math.round(tempOffset.x * 100)}%</div>
                </div>
                <div className="text-center">
                  <div className="text-muted-foreground text-xs">Y Position</div>
                  <div className="text-base font-mono">{Math.round(tempOffset.y * 100)}%</div>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="space-y-3">
              <Button
                variant="outline"
                onClick={() => setTempOffset({ x: 0, y: 0 })}
                className="w-full"
                size="sm"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset Position
              </Button>

              <div className="space-y-2">
                <Button
                  onClick={handleApply}
                  className="w-full"
                >
                  Apply Changes
                </Button>
                <Button
                  variant="outline"
                  onClick={onClose}
                  className="w-full"
                  size="sm"
                >
                  Cancel
                </Button>
              </div>
            </div>

            {/* Help text */}
            <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
              <p className="font-medium text-foreground">Quick Tips:</p>
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
