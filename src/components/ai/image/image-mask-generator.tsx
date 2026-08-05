import { Circle, Eraser, Pencil, Redo2, Square, Undo2 } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

type DrawingMode = 'brush' | 'rectangle' | 'circle' | 'eraser';

interface DrawingAction {
  type: 'draw' | 'clear';
  imageData: ImageData;
}

interface ImageMaskCreatorProps {
  image: string | null;
  onImageSelect: (file: File) => void;
}

// Create a type for the methods we want to expose
export interface ImageMaskCreatorRef {
  getMaskDataUrl: () => string | null;
  getImageDataUrl: () => string | null;
}

// Add this helper function after the component interface definitions
const convertMaskToWhiteOnBlack = (canvas: HTMLCanvasElement): HTMLCanvasElement => {
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = canvas.width;
  tempCanvas.height = canvas.height;
  const tempCtx = tempCanvas.getContext('2d')!;

  // Draw original mask
  tempCtx.drawImage(canvas, 0, 0);
  const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
  const data = imageData.data;

  // Convert the image data
  for (let i = 0; i < data.length; i += 4) {
    // Check if pixel has any opacity (was drawn on)
    //@ts-expect-error
    if (data[i + 3] > 0) {
      // If it was drawn on (black in the original), make it white
      if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0) {
        data[i] = 255; // R
        data[i + 1] = 255; // G
        data[i + 2] = 255; // B
        data[i + 3] = 255; // A
      } else {
        // Any other color becomes black
        data[i] = 0; // R
        data[i + 1] = 0; // G
        data[i + 2] = 0; // B
        data[i + 3] = 255; // A
      }
    } else {
      // Transparent pixels become black
      data[i] = 0; // R
      data[i + 1] = 0; // G
      data[i + 2] = 0; // B
      data[i + 3] = 255; // A
    }
  }

  tempCtx.putImageData(imageData, 0, 0);
  return tempCanvas;
};

const ImageMaskCreator = React.forwardRef<ImageMaskCreatorRef, ImageMaskCreatorProps>(({ image, onImageSelect }, ref) => {
  // Add state for original dimensions
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(10);
  const [drawingMode, setDrawingMode] = useState<DrawingMode>('brush');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [undoStack, setUndoStack] = useState<DrawingAction[]>([]);
  const [redoStack, setRedoStack] = useState<DrawingAction[]>([]);
  const startPositionRef = useRef<{ x: number; y: number } | null>(null);
  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });
  const [isOverCanvas, setIsOverCanvas] = useState(false);
  const lastMouseEvent = useRef<React.MouseEvent<HTMLCanvasElement> | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: <We need to use the image ref to get the image dimensions>
  useEffect(() => {
    if (image) {
      const img = new Image();
      img.onload = () => {
        // Store original dimensions
        setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });

        if (canvasRef.current && maskCanvasRef.current) {
          // Set both canvases to original image dimensions
          canvasRef.current.width = img.naturalWidth;
          canvasRef.current.height = img.naturalHeight;
          maskCanvasRef.current.width = img.naturalWidth;
          maskCanvasRef.current.height = img.naturalHeight;

          const ctx = canvasRef.current.getContext('2d')!;
          const maskCtx = maskCanvasRef.current.getContext('2d')!;
          ctx.lineCap = 'round';
          maskCtx.lineCap = 'round';
          setBrushSize(10); // Re-apply brush size
          updateBrushSize();
          saveDrawingState();
        }
      };
      img.src = image;
      imageRef.current = img;
    }
  }, [image]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: This is a false positive
  useEffect(() => {
    updateBrushSize();
  }, [brushSize]);

  const updateBrushSize = () => {
    if (canvasRef.current && maskCanvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      const maskCtx = maskCanvasRef.current.getContext('2d');
      if (ctx && maskCtx) {
        ctx.lineWidth = brushSize;
        maskCtx.lineWidth = brushSize;
      }
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      onImageSelect(e.target.files[0]);
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const { x, y } = getCanvasCoordinates(e);
    startPositionRef.current = { x, y };

    if (drawingMode === 'brush' || drawingMode === 'eraser') {
      const ctx = canvasRef.current!.getContext('2d')!;
      const maskCtx = maskCanvasRef.current!.getContext('2d')!;
      ctx.beginPath();
      maskCtx.beginPath();
      ctx.moveTo(x, y);
      maskCtx.moveTo(x, y);
    }
  };

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      if (drawingMode === 'rectangle' || drawingMode === 'circle') {
        const canvas = canvasRef.current!;
        const maskCanvas = maskCanvasRef.current!;
        const ctx = canvas.getContext('2d')!;
        const maskCtx = maskCanvas.getContext('2d')!;
        const { x, y } = getCanvasCoordinates(lastMouseEvent.current!);
        const startPos = startPositionRef.current!;

        // Draw solid black shape on both canvases
        [ctx, maskCtx].forEach((context) => {
          context.globalCompositeOperation = 'source-over';
          context.beginPath();

          if (drawingMode === 'rectangle') {
            context.rect(startPos.x, startPos.y, x - startPos.x, y - startPos.y);
          } else {
            const radiusX = Math.abs(x - startPos.x) / 2;
            const radiusY = Math.abs(y - startPos.y) / 2;
            const centerX = Math.min(startPos.x, x) + radiusX;
            const centerY = Math.min(startPos.y, y) + radiusY;
            context.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
          }

          context.fillStyle = 'black';
          context.fill();
        });

        saveDrawingState();
      }
    }
    startPositionRef.current = null;
    lastMouseEvent.current = null;
  };

  const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    return { x, y };
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !canvasRef.current || !maskCanvasRef.current) return;

    const { x, y } = getCanvasCoordinates(e);
    const ctx = canvasRef.current.getContext('2d')!;
    const maskCtx = maskCanvasRef.current.getContext('2d')!;

    if (drawingMode === 'brush' || drawingMode === 'eraser') {
      // Set operation for both canvases
      ctx.globalCompositeOperation = drawingMode === 'eraser' ? 'destination-out' : 'source-over';
      maskCtx.globalCompositeOperation = drawingMode === 'eraser' ? 'destination-out' : 'source-over';

      ctx.lineTo(x, y);
      ctx.stroke();
      maskCtx.lineTo(x, y);
      maskCtx.stroke();
    } else if (drawingMode === 'rectangle' || drawingMode === 'circle') {
      const startPos = startPositionRef.current!;

      // Clear and redraw existing mask on both canvases
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.drawImage(maskCanvasRef.current, 0, 0);

      // Draw preview shape in black
      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath();

      if (drawingMode === 'rectangle') {
        ctx.rect(startPos.x, startPos.y, x - startPos.x, y - startPos.y);
      } else {
        const radiusX = Math.abs(x - startPos.x) / 2;
        const radiusY = Math.abs(y - startPos.y) / 2;
        const centerX = Math.min(startPos.x, x) + radiusX;
        const centerY = Math.min(startPos.y, y) + radiusY;
        ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
      }

      // Fill with semi-transparent black for preview
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fill();
    }
  };

  const saveDrawingState = () => {
    if (maskCanvasRef.current) {
      const maskCtx = maskCanvasRef.current.getContext('2d')!;
      const imageData = maskCtx.getImageData(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
      setUndoStack((prevStack) => [...prevStack, { type: 'draw', imageData }]);
      setRedoStack([]);
    }
  };

  const undo = () => {
    if (undoStack.length > 1) {
      const currentState = undoStack[undoStack.length - 1];
      const previousState = undoStack[undoStack.length - 2];
      setUndoStack((prevStack) => prevStack.slice(0, -1));
      if (currentState) {
        setRedoStack((prevStack) => [...prevStack, currentState]);
      }
      if (previousState) {
        applyImageData(previousState.imageData);
      }
    } else if (undoStack.length === 1) {
      clearMask();
    }
  };

  const redo = () => {
    if (redoStack.length > 0) {
      const nextState = redoStack[redoStack.length - 1];
      setRedoStack((prevStack) => prevStack.slice(0, -1));
      if (nextState) {
        setUndoStack((prevStack) => [...prevStack, nextState]);
      }
      if (nextState) {
        applyImageData(nextState.imageData);
      }
    }
  };

  const applyImageData = (imageData: ImageData) => {
    if (canvasRef.current && maskCanvasRef.current) {
      const ctx = canvasRef.current.getContext('2d')!;
      const maskCtx = maskCanvasRef.current.getContext('2d')!;
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      maskCtx.clearRect(0, 0, maskCtx.canvas.width, maskCtx.canvas.height);
      maskCtx.putImageData(imageData, 0, 0);
      ctx.drawImage(maskCanvasRef.current, 0, 0);
    }
  };

  // Replace the downloadMask function with this
  const downloadMask = () => {
    if (!maskCanvasRef.current || !imageDimensions) return;

    const convertedCanvas = convertMaskToWhiteOnBlack(maskCanvasRef.current);

    const link = document.createElement('a');
    if (!imageRef.current) {
      console.error('Image reference is missing');
      return;
    }
    link.download = `${imageRef.current.src.split('/').pop()?.split('.')[0]}_mask.png`;
    link.href = convertedCanvas.toDataURL('image/png');
    link.click();
  };

  const clearMask = () => {
    if (canvasRef.current && maskCanvasRef.current) {
      const canvas = canvasRef.current;
      const maskCanvas = maskCanvasRef.current;
      const ctx = canvas.getContext('2d')!;
      const maskCtx = maskCanvas.getContext('2d')!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
      setUndoStack([]);
      setRedoStack([]);
      saveDrawingState();
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    lastMouseEvent.current = e; // Store the last mouse event
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      setCursorPosition({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
    draw(e);
  };

  const handleMouseEnter = () => {
    setIsOverCanvas(true);
  };

  const handleMouseLeave = () => {
    setIsOverCanvas(false);
    stopDrawing();
  };

  // Update the useImperativeHandle hook to use the conversion
  React.useImperativeHandle(ref, () => ({
    getMaskDataUrl: () => {
      if (!maskCanvasRef.current) return null;
      const convertedCanvas = convertMaskToWhiteOnBlack(maskCanvasRef.current);
      return convertedCanvas.toDataURL('image/png');
    },
    getImageDataUrl: () => {
      if (!imageRef.current) return null;
      return imageRef.current.src;
    },
  }));

  return (
    <div className="flex flex-col items-center space-y-4 p-4">
      <input
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        className="mb-4"
      />
      {image && (
        <>
          <div className="flex gap-4">
            {/* Original image and drawing canvas */}
            <div className="relative inline-block">
              {isOverCanvas && (
                <>
                  {(drawingMode === 'brush' || drawingMode === 'eraser') && (
                    <div
                      className="pointer-events-none absolute border-2 border-white rounded-full -translate-x-1/2 -translate-y-1/2"
                      style={{
                        width: `${brushSize}px`,
                        height: `${brushSize}px`,
                        left: cursorPosition.x,
                        top: cursorPosition.y,
                        boxShadow: '0 0 0 1px black',
                      }}
                    />
                  )}
                  {(drawingMode === 'rectangle' || drawingMode === 'circle') && (
                    <div
                      className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
                      style={{
                        left: cursorPosition.x,
                        top: cursorPosition.y,
                        width: '20px',
                        height: '20px',
                      }}
                    >
                      <div className="absolute left-1/2 top-0 w-px h-full bg-white shadow-[0_0_0_1px_rgba(0,0,0,1)]" />
                      <div className="absolute top-1/2 left-0 h-px w-full bg-white shadow-[0_0_0_1px_rgba(0,0,0,1)]" />
                    </div>
                  )}
                </>
              )}
              <img
                ref={imageRef}
                src={image}
                alt="Selected"
                className="max-w-full h-auto"
              />
              <canvas
                ref={canvasRef}
                onMouseDown={startDrawing}
                onMouseUp={stopDrawing}
                onMouseMove={handleMouseMove}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                onBlur={stopDrawing}
                className="absolute top-0 left-0 w-full h-full cursor-none"
              />
              <canvas
                ref={maskCanvasRef}
                className="hidden"
              />
            </div>

            {/* Mask preview */}
            <div className="relative inline-block bg-muted">
              <canvas
                ref={maskCanvasRef}
                width={imageDimensions?.width}
                height={imageDimensions?.height}
                className="max-w-full h-auto"
              />
            </div>
          </div>

          <div className="space-x-2">
            <Button
              onClick={undo}
              disabled={undoStack.length <= 1}
            >
              <Undo2 className="w-4 h-4 mr-2" />
              Undo
            </Button>
            <Button
              onClick={redo}
              disabled={redoStack.length === 0}
            >
              <Redo2 className="w-4 h-4 mr-2" />
              Redo
            </Button>
            <Button onClick={downloadMask}>Download Mask</Button>
            <Button
              onClick={clearMask}
              variant="outline"
            >
              Clear Mask
            </Button>
          </div>
          <div className="flex items-center space-x-4">
            <span>Brush Size:</span>
            <Slider
              value={[brushSize]}
              onValueChange={(value) => {
                const newValue = Array.isArray(value) ? value[0] : value;
                if (newValue !== undefined) setBrushSize(newValue);
              }}
              min={1}
              max={50}
              step={1}
              className="w-[200px]"
            />
            <span>{brushSize}px</span>
          </div>
          <ToggleGroup
            value={[drawingMode]}
            onValueChange={(values) => {
              const newValue = values[values.length - 1] as DrawingMode;
              if (newValue) setDrawingMode(newValue);
            }}
          >
            <ToggleGroupItem
              value="brush"
              aria-label="Brush tool"
            >
              <Pencil className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem
              value="eraser"
              aria-label="Eraser tool"
            >
              <Eraser className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem
              value="rectangle"
              aria-label="Rectangle tool"
            >
              <Square className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem
              value="circle"
              aria-label="Circle tool"
            >
              <Circle className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        </>
      )}
    </div>
  );
});

ImageMaskCreator.displayName = 'ImageMaskCreator';

export default ImageMaskCreator;
