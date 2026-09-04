import { Grid } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import { deriveImageGridLayout, useImageGridStore } from '@/hooks/stores/image-grid-store';
import { GridConfigPanel } from './grid-config-panel';
import { GridPreviewPanel } from './grid-preview-panel';
import styles from './image-grid-generator.module.css';
import { ImagePositionEditor } from './image-position-editor';
import { ImageSelector } from './image-selector';

export function ImageGridGenerator() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [positionEditorState, setPositionEditorState] = useState<{
    isOpen: boolean;
    imageIndex: number;
  }>({ isOpen: false, imageIndex: -1 });

  const {
    selectedImages,
    config,
    isGenerating,
    addLocalImages,
    removeImage,
    reorderImages,
    updateConfig,
    updateImagePositionAndZoom,
    clearImages,
    setGenerating,
    setPreviewUrl,
  } = useImageGridStore(
    useShallow((state) => ({
      selectedImages: state.selectedImages,
      config: state.config,
      isGenerating: state.isGenerating,
      addLocalImages: state.addLocalImages,
      removeImage: state.removeImage,
      reorderImages: state.reorderImages,
      updateConfig: state.updateConfig,
      updateImagePositionAndZoom: state.updateImagePositionAndZoom,
      clearImages: state.clearImages,
      setGenerating: state.setGenerating,
      setPreviewUrl: state.setPreviewUrl,
    })),
  );

  const { gridDimensions, cellDimensions, actualCanvasSize, gridCapacityWarning, hasImages, canGenerate } = useMemo(
    () => deriveImageGridLayout({ selectedImages, config }),
    [selectedImages, config],
  );

  const handleDownload = useCallback(async () => {
    if (!canvasRef.current || !canGenerate) return;

    setGenerating(true);
    try {
      canvasRef.current.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `image-grid-${Math.round(actualCanvasSize.width)}x${Math.round(actualCanvasSize.height)}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          toast.success('Image grid downloaded successfully!');
        } else {
          toast.error('Failed to generate image grid');
        }
        setGenerating(false);
      }, 'image/png');
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to download image grid');
      setGenerating(false);
    }
  }, [canGenerate, actualCanvasSize, setGenerating]);

  const handleCanvasReady = (canvas: HTMLCanvasElement) => {
    canvasRef.current = canvas;
  };

  return (
    <div className="stack space-6">
      <div className="cluster space-2">
        <Grid className={styles.titleIcon} />
        <h1 className={styles.title}>Image Grid Generator</h1>
      </div>

      <div className={styles.columns}>
        {/* Configuration Panel */}
        <div className="stack space-6">
          <GridConfigPanel
            config={config}
            updateConfig={updateConfig}
            gridDimensions={gridDimensions}
            cellDimensions={cellDimensions}
            actualCanvasSize={actualCanvasSize}
            gridCapacityWarning={gridCapacityWarning}
            hasImages={hasImages}
            imageCount={selectedImages.length}
          />

          <ImageSelector
            selectedImages={selectedImages}
            onAddLocalImages={addLocalImages}
            onRemoveImage={removeImage}
            onReorderImages={reorderImages}
            onClearAll={clearImages}
          />
        </div>

        {/* Preview and Download */}
        <div className="stack space-6">
          <GridPreviewPanel
            images={selectedImages}
            config={config}
            gridDimensions={gridDimensions}
            cellDimensions={cellDimensions}
            actualCanvasSize={actualCanvasSize}
            hasImages={hasImages}
            canGenerate={canGenerate}
            isGenerating={isGenerating}
            onPreviewGenerated={setPreviewUrl}
            onCanvasReady={handleCanvasReady}
            onImageClick={(imageIndex) => setPositionEditorState({ isOpen: true, imageIndex })}
            onDownload={handleDownload}
          />
        </div>
      </div>

      {/* Position Editor Modal */}
      {positionEditorState.isOpen && positionEditorState.imageIndex >= 0 && selectedImages[positionEditorState.imageIndex] && (
        <ImagePositionEditor
          image={selectedImages[positionEditorState.imageIndex]!}
          isOpen={positionEditorState.isOpen}
          onClose={() => setPositionEditorState({ isOpen: false, imageIndex: -1 })}
          onUpdateOffset={(offsetX, offsetY, zoom) => {
            const image = selectedImages[positionEditorState.imageIndex];
            if (image) {
              updateImagePositionAndZoom(image.id, offsetX, offsetY, zoom);
            }
          }}
          cellDimensions={cellDimensions}
        />
      )}
    </div>
  );
}
