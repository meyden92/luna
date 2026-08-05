import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { ImageGridConfig, SelectedImage } from '@/schemas/image-grid';

interface ImageGridCanvasProps {
  images: SelectedImage[];
  config: ImageGridConfig;
  gridDimensions: { cols: number; rows: number };
  cellDimensions: { width: number; height: number };
  actualCanvasSize: { width: number; height: number };
  onPreviewGenerated?: (previewUrl: string | null) => void;
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
  onImageClick?: (imageIndex: number) => void;
  className?: string;
}

function ImageGridCanvasComponent({
  images,
  config,
  gridDimensions,
  cellDimensions,
  actualCanvasSize,
  onPreviewGenerated,
  onCanvasReady,
  onImageClick,
  className,
}: ImageGridCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoverCanvasRef = useRef<HTMLCanvasElement>(null);
  const imagesLoadedRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const animationFrameRef = useRef<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const getImageIndexAtPosition = useCallback(
    (clientX: number, clientY: number): number | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;

      const rect = canvas.getBoundingClientRect();
      const clickX = clientX - rect.left;
      const clickY = clientY - rect.top;

      const scaleX = actualCanvasSize.width / rect.width;
      const scaleY = actualCanvasSize.height / rect.height;
      const canvasX = clickX * scaleX;
      const canvasY = clickY * scaleY;

      for (let i = 0; i < images.length; i++) {
        const col = i % gridDimensions.cols;
        const row = Math.floor(i / gridDimensions.cols);

        const cellX = Math.round(col * (cellDimensions.width + config.spacing));
        const cellY = Math.round(row * (cellDimensions.height + config.spacing));

        if (canvasX >= cellX && canvasX <= cellX + cellDimensions.width && canvasY >= cellY && canvasY <= cellY + cellDimensions.height) {
          return i;
        }
      }

      return null;
    },
    [actualCanvasSize, images.length, gridDimensions, cellDimensions, config.spacing],
  );

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!onImageClick) return;

      const imageIndex = getImageIndexAtPosition(e.clientX, e.clientY);
      if (imageIndex !== null) {
        onImageClick(imageIndex);
      }
    },
    [onImageClick, getImageIndexAtPosition],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!onImageClick) return; // Only show hover when click is possible

      const imageIndex = getImageIndexAtPosition(e.clientX, e.clientY);
      if (imageIndex !== hoveredIndex) {
        setHoveredIndex(imageIndex);
      }
    },
    [getImageIndexAtPosition, hoveredIndex, onImageClick],
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredIndex(null);
  }, []);

  const loadImage = useCallback((url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();

      // Since all images are local files (blob URLs), no CORS handling needed
      img.onload = () => resolve(img);
      img.onerror = (error) => {
        console.error('Failed to load local image:', url, error);
        reject(new Error(`Failed to load image: ${url}`));
      };
      img.src = url;
    });
  }, []);

  const drawImageToCell = useCallback(
    (ctx: CanvasRenderingContext2D, img: HTMLImageElement, selectedImage: SelectedImage, col: number, row: number) => {
      // Use consistent coordinate calculations to match interactive overlay
      const cellX = Math.round(col * (cellDimensions.width + config.spacing));
      const cellY = Math.round(row * (cellDimensions.height + config.spacing));
      const cellWidth = cellDimensions.width;
      const cellHeight = cellDimensions.height;

      ctx.save();

      // Apply filters if any are set
      const filters = [];
      if (config.filters.blur > 0) filters.push(`blur(${config.filters.blur}px)`);
      if (config.filters.grayscale > 0) filters.push(`grayscale(${config.filters.grayscale}%)`);
      if (config.filters.saturation !== 100) filters.push(`saturate(${config.filters.saturation}%)`);
      if (config.filters.brightness !== 100) filters.push(`brightness(${config.filters.brightness}%)`);
      if (config.filters.contrast !== 100) filters.push(`contrast(${config.filters.contrast}%)`);
      if (config.filters.sepia > 0) filters.push(`sepia(${config.filters.sepia}%)`);

      if (filters.length > 0) {
        ctx.filter = filters.join(' ');
      }

      // Set up clipping region for the cell
      ctx.beginPath();
      ctx.rect(cellX, cellY, cellWidth, cellHeight);
      ctx.clip();

      // Cover mode: Maintain aspect ratio, fill entire cell
      const imgRatio = img.width / img.height;
      const cellRatio = cellWidth / cellHeight;

      let drawX = cellX;
      let drawY = cellY;
      let drawWidth = cellWidth;
      let drawHeight = cellHeight;

      if (imgRatio > cellRatio) {
        // Image is wider, fit to height and crop width
        drawHeight = cellHeight;
        drawWidth = Math.round(cellHeight * imgRatio);
        drawX = cellX - Math.round((drawWidth - cellWidth) / 2);
      } else {
        // Image is taller, fit to width and crop height
        drawWidth = cellWidth;
        drawHeight = Math.round(cellWidth / imgRatio);
        drawY = cellY - Math.round((drawHeight - cellHeight) / 2);
      }

      // Apply zoom factor
      const zoom = selectedImage.zoom || 1.0;
      const zoomedWidth = Math.round(drawWidth * zoom);
      const zoomedHeight = Math.round(drawHeight * zoom);

      // Adjust position to keep zoomed image centered initially
      const zoomOffsetX = Math.round((zoomedWidth - drawWidth) / 2);
      const zoomOffsetY = Math.round((zoomedHeight - drawHeight) / 2);
      drawX -= zoomOffsetX;
      drawY -= zoomOffsetY;
      drawWidth = zoomedWidth;
      drawHeight = zoomedHeight;

      // Apply user-defined offsets (scale with zoom)
      const maxOffsetX = Math.max(0, (drawWidth - cellWidth) / 2);
      const maxOffsetY = Math.max(0, (drawHeight - cellHeight) / 2);
      drawX -= Math.round(selectedImage.offsetX * maxOffsetX);
      drawY -= Math.round(selectedImage.offsetY * maxOffsetY);

      ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
      ctx.restore();
    },
    [cellDimensions, config],
  );

  const drawHoverHighlight = useCallback(
    (ctx: CanvasRenderingContext2D, col: number, row: number) => {
      const cellX = Math.round(col * (cellDimensions.width + config.spacing));
      const cellY = Math.round(row * (cellDimensions.height + config.spacing));
      const cellWidth = cellDimensions.width;
      const cellHeight = cellDimensions.height;

      ctx.save();

      // Draw semi-transparent dark overlay
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(cellX, cellY, cellWidth, cellHeight);

      // Draw bright border
      ctx.strokeStyle = '#3b82f6'; // Primary blue color
      ctx.lineWidth = 3;
      ctx.strokeRect(cellX + 1.5, cellY + 1.5, cellWidth - 3, cellHeight - 3);

      ctx.restore();
    },
    [cellDimensions, config.spacing],
  );

  const generateGrid = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      console.warn('Canvas not available for grid generation');
      onPreviewGenerated?.(null);
      return;
    }

    if (images.length === 0) {
      onPreviewGenerated?.(null);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error('Unable to get 2D rendering context');
      onPreviewGenerated?.(null);
      return;
    }

    // Get device pixel ratio for high-DPI displays
    const devicePixelRatio = (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1;

    // Set canvas size to actual size (may be cropped)
    const canvasWidth = Math.max(1, Math.round(actualCanvasSize.width));
    const canvasHeight = Math.max(1, Math.round(actualCanvasSize.height));

    // Validate canvas dimensions aren't too large
    if (canvasWidth > 8192 || canvasHeight > 8192) {
      console.error('Canvas dimensions too large:', canvasWidth, 'x', canvasHeight);
      onPreviewGenerated?.(null);
      return;
    }

    // Set internal canvas size accounting for device pixel ratio
    canvas.width = canvasWidth * devicePixelRatio;
    canvas.height = canvasHeight * devicePixelRatio;

    // Scale canvas back down through the responsive wrapper.
    canvas.style.width = '100%';
    canvas.style.height = '100%';

    // Scale the context to match device pixel ratio
    ctx.scale(devicePixelRatio, devicePixelRatio);

    // Enable high-quality image rendering
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Clear canvas with configured background color
    ctx.fillStyle = config.backgroundColor;
    ctx.fillRect(0, 0, actualCanvasSize.width, actualCanvasSize.height);

    try {
      // Load all images with error handling
      const loadResults = await Promise.allSettled(
        images.map(async (selectedImage, index) => {
          try {
            // Use the blob URL for local files
            const imageUrl = selectedImage.url;
            let cachedImage = imagesLoadedRef.current.get(imageUrl);
            if (!cachedImage) {
              cachedImage = await loadImage(imageUrl);
              imagesLoadedRef.current.set(imageUrl, cachedImage);
            }
            return { success: true, image: cachedImage, index };
          } catch (error) {
            console.error('Failed to load image:', selectedImage.name, error);
            return { success: false, error, index };
          }
        }),
      );

      const loadedImages: (HTMLImageElement | undefined)[] = [];
      const failedImages: number[] = [];

      loadResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          const { success, index } = result.value;
          if (success) {
            loadedImages[index] = result.value.image;
          } else {
            failedImages.push(index);
            loadedImages[index] = undefined;
            console.warn(`Image at index ${index} failed to load`);
          }
        } else {
          // This shouldn't happen with Promise.allSettled, but handle it just in case
          console.warn('Unexpected Promise.allSettled rejection');
        }
      });

      // Draw images to grid (only draw successfully loaded images)
      loadedImages.forEach((img, index) => {
        if (img && images[index]) {
          const col = index % gridDimensions.cols;
          const row = Math.floor(index / gridDimensions.cols);
          const selectedImage = images[index];
          drawImageToCell(ctx, img, selectedImage, col, row);
        }
      });

      // Generate preview URL
      canvas.toBlob((blob) => {
        if (blob) {
          const previewUrl = URL.createObjectURL(blob);
          onPreviewGenerated?.(previewUrl);
        }
      }, 'image/png');

      // Notify that canvas is ready
      onCanvasReady?.(canvas);
    } catch (error) {
      console.error('Error generating grid:', error);
      if (error instanceof Error) {
        console.error('Error details:', error.message, error.stack);
      }
      onPreviewGenerated?.(null);
    }
  }, [images, gridDimensions, actualCanvasSize, drawImageToCell, loadImage, onPreviewGenerated, onCanvasReady, config.backgroundColor]);

  // Regenerate grid when dependencies change
  useEffect(() => {
    generateGrid();
  }, [generateGrid]);

  // Draw hover feedback on a transparent overlay so pointer movement never re-encodes the preview PNG.
  useEffect(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    animationFrameRef.current = requestAnimationFrame(() => {
      const canvas = hoverCanvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const devicePixelRatio = (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1;
      const canvasWidth = Math.max(1, Math.round(actualCanvasSize.width));
      const canvasHeight = Math.max(1, Math.round(actualCanvasSize.height));

      canvas.width = canvasWidth * devicePixelRatio;
      canvas.height = canvasHeight * devicePixelRatio;
      canvas.style.width = '100%';
      canvas.style.height = '100%';

      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      ctx.clearRect(0, 0, actualCanvasSize.width, actualCanvasSize.height);

      if (hoveredIndex !== null && hoveredIndex < images.length) {
        const col = hoveredIndex % gridDimensions.cols;
        const row = Math.floor(hoveredIndex / gridDimensions.cols);
        drawHoverHighlight(ctx, col, row);
      }
    });

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [actualCanvasSize, drawHoverHighlight, gridDimensions.cols, hoveredIndex, images.length]);

  // Cleanup image cache when component unmounts or when images change significantly
  useEffect(() => {
    return () => {
      // Clear the cache to free up memory
      imagesLoadedRef.current.clear();
    };
  }, []);

  // Clean up cache when images list changes to prevent stale entries
  useEffect(() => {
    const currentUrls = new Set(images.map((img) => img.url));
    const cachedUrls = Array.from(imagesLoadedRef.current.keys());

    // Remove cached images that are no longer in use
    for (const url of cachedUrls) {
      if (!currentUrls.has(url)) {
        imagesLoadedRef.current.delete(url);
      }
    }
  }, [images]);

  return (
    <div
      className={className}
      onClick={handleCanvasClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        position: 'relative',
        display: 'block',
        maxWidth: '100%',
        width: `${Math.max(1, Math.round(actualCanvasSize.width))}px`,
        aspectRatio: `${Math.max(1, Math.round(actualCanvasSize.width))} / ${Math.max(1, Math.round(actualCanvasSize.height))}`,
        cursor: onImageClick ? 'pointer' : 'default',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
        }}
      />
      <canvas
        ref={hoverCanvasRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

export const ImageGridCanvas = memo(ImageGridCanvasComponent, (prevProps, nextProps) => {
  const configKeys = ['backgroundColor', 'spacing', 'filters'] as const;
  const configChanged = configKeys.some((key) => prevProps.config[key] !== nextProps.config[key]);

  const dimensionsChanged =
    prevProps.gridDimensions.cols !== nextProps.gridDimensions.cols ||
    prevProps.gridDimensions.rows !== nextProps.gridDimensions.rows ||
    prevProps.cellDimensions.width !== nextProps.cellDimensions.width ||
    prevProps.cellDimensions.height !== nextProps.cellDimensions.height ||
    prevProps.actualCanvasSize.width !== nextProps.actualCanvasSize.width ||
    prevProps.actualCanvasSize.height !== nextProps.actualCanvasSize.height;

  return !configChanged && !dimensionsChanged && prevProps.images === nextProps.images;
});
